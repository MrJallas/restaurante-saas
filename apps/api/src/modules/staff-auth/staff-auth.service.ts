import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../../infra/redis/redis.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { hashPin, timingSafeEqualHex } from '../staff/staff-pin.util';

type StaffRole = 'manager' | 'host' | 'waiter' | 'cook' | 'bartender' | 'cashier';

interface StaffAuthRow {
  id: string;
  name: string;
  role: StaffRole;
  pin_hash: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
}

interface RecoveryPayload {
  staffId: string;
  cpf: string;
  code: string;
}

interface ResetPayload {
  staffId: string;
  cpf: string;
}

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_LOCK_SECONDS = 15 * 60;
const RECOVERY_TTL_SECONDS = 10 * 60;
const RESET_TOKEN_TTL_SECONDS = 10 * 60;
const DUMMY_PIN_HASH = hashPin('000000');

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
  ) {}

  async login(input: { cpf: string; pin: string }, ip: string) {
    const cpf = this.normalizeCpf(input.cpf);
    if (!cpf || !/^\d{4,6}$/.test(input.pin)) {
      throw this.authFailure();
    }

    const throttleKey = this.loginThrottleKey(cpf, ip);
    if (await this.redis.get(`${throttleKey}:lock`)) {
      throw this.structuredError(
        HttpStatus.TOO_MANY_REQUESTS,
        'Muitas tentativas. Aguarde alguns minutos.',
        'AUTH_THROTTLED',
      );
    }

    const staff = await this.findActiveByCpf(cpf);
    const expectedHash = staff?.pin_hash ?? DUMMY_PIN_HASH;
    const pinMatches = timingSafeEqualHex(expectedHash, hashPin(input.pin));
    const authenticated = Boolean(staff && pinMatches);

    if (!authenticated) {
      await this.recordLoginFailure(throttleKey);
      throw this.authFailure();
    }

    await this.redis.del(`${throttleKey}:attempts`);
    await this.redis.del(`${throttleKey}:lock`);

    return {
      staff: {
        id: staff!.id,
        name: staff!.name,
        role: staff!.role,
      },
      headers: {
        staffId: staff!.id,
        staffRole: staff!.role,
      },
      nextPath: this.nextPathForRole(staff!.role),
    };
  }

  async forgot(input: { cpf: string }) {
    const cpf = this.normalizeCpf(input.cpf);
    const staff = cpf ? await this.findActiveByCpf(cpf) : null;

    if (!cpf || !staff) {
      return {
        message_user: 'Se o CPF estiver cadastrado, enviaremos um código de recuperação.',
        code: 'RECOVERY_REQUEST_ACCEPTED',
        channels: [],
      };
    }

    if (
      process.env.NODE_ENV === 'production' &&
      process.env.STAFF_RECOVERY_DELIVERY_ENABLED !== 'true'
    ) {
      throw new ServiceUnavailableException({
        message: 'Canal de recuperação indisponível.',
        message_user: 'Recuperação indisponível no momento. Procure um gerente.',
        code: 'RECOVERY_CHANNEL_UNAVAILABLE',
      });
    }

    const devCode = String(randomInt(100000, 1000000));
    const payload: RecoveryPayload = {
      staffId: staff.id,
      cpf,
      code: devCode,
    };
    await this.redis.set(this.recoveryKey(cpf), JSON.stringify(payload), RECOVERY_TTL_SECONDS);

    return {
      message_user: 'Código de recuperação enviado.',
      code: 'RECOVERY_CODE_SENT',
      channels: [
        ...(staff.phone ? [{ type: 'phone', masked: this.maskPhone(staff.phone) }] : []),
        ...(staff.email ? [{ type: 'email', masked: this.maskEmail(staff.email) }] : []),
      ],
      ...(process.env.NODE_ENV !== 'production' ? { devCode } : {}),
    };
  }

  async verifyForgot(input: { cpf: string; code: string }) {
    const cpf = this.normalizeCpf(input.cpf);
    if (!cpf || !/^\d{6}$/.test(input.code)) {
      throw this.invalidRecoveryCode();
    }

    const raw = await this.redis.get(this.recoveryKey(cpf));
    const payload = raw ? this.parseJson<RecoveryPayload>(raw) : null;
    if (!payload || payload.cpf !== cpf || !this.safeEqual(payload.code, input.code)) {
      throw this.invalidRecoveryCode();
    }

    const resetToken = randomUUID();
    const resetPayload: ResetPayload = {
      staffId: payload.staffId,
      cpf,
    };
    await this.redis.set(
      this.resetTokenKey(resetToken),
      JSON.stringify(resetPayload),
      RESET_TOKEN_TTL_SECONDS,
    );
    await this.redis.del(this.recoveryKey(cpf));

    return {
      message_user: 'Código validado.',
      code: 'RECOVERY_CODE_VERIFIED',
      resetToken,
    };
  }

  async resetPin(input: { resetToken: string; pin: string }) {
    if (!/^\d{4,6}$/.test(input.pin)) {
      throw this.structuredError(
        HttpStatus.BAD_REQUEST,
        'PIN deve ter 4 a 6 dígitos.',
        'INVALID_PIN',
      );
    }

    const raw = await this.redis.get(this.resetTokenKey(input.resetToken));
    const payload = raw ? this.parseJson<ResetPayload>(raw) : null;
    if (!payload) {
      throw this.structuredError(
        HttpStatus.BAD_REQUEST,
        'Código expirado. Solicite outro código.',
        'RECOVERY_TOKEN_INVALID',
      );
    }

    const updated = (await this.tenantConn.query(
      `UPDATE staff
          SET pin_hash = $1, updated_at = now()
        WHERE id = $2
          AND cpf = $3
          AND is_active = true
        RETURNING id`,
      [hashPin(input.pin), payload.staffId, payload.cpf],
    )) as Array<{ id: string }>;

    await this.redis.del(this.resetTokenKey(input.resetToken));

    if (!updated.length) {
      throw this.structuredError(
        HttpStatus.BAD_REQUEST,
        'Código expirado. Solicite outro código.',
        'RECOVERY_TOKEN_INVALID',
      );
    }

    return {
      message_user: 'PIN atualizado.',
      code: 'PIN_RESET',
    };
  }

  private async findActiveByCpf(cpf: string): Promise<StaffAuthRow | null> {
    const rows = (await this.tenantConn.query(
      `SELECT id, name, role, pin_hash, cpf, phone, email
         FROM staff
        WHERE cpf = $1
          AND is_active = true
        LIMIT 1`,
      [cpf],
    )) as StaffAuthRow[];
    return rows[0] ?? null;
  }

  private async recordLoginFailure(throttleKey: string): Promise<void> {
    const attemptsKey = `${throttleKey}:attempts`;
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      await this.redis.expire(attemptsKey, LOGIN_WINDOW_SECONDS);
    }
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      await this.redis.set(`${throttleKey}:lock`, '1', LOGIN_LOCK_SECONDS);
      await this.redis.del(attemptsKey);
    }
  }

  private loginThrottleKey(cpf: string, ip: string): string {
    return `staff-auth:login:${this.tenantSlug()}:${cpf}:${ip}`;
  }

  private recoveryKey(cpf: string): string {
    return `staff-auth:recovery:${this.tenantSlug()}:${cpf}`;
  }

  private resetTokenKey(token: string): string {
    return `staff-auth:reset:${this.tenantSlug()}:${token}`;
  }

  private tenantSlug(): string {
    return this.tenantConn.getTenantSlug() ?? 'unknown';
  }

  private normalizeCpf(value: string): string | null {
    const cpf = String(value ?? '').replace(/\D/g, '');
    return cpf.length === 11 ? cpf : null;
  }

  private nextPathForRole(role: StaffRole): string {
    if (role === 'manager') return '/manager';
    if (role === 'host') return '/host';
    if (role === 'waiter') return '/waiter';
    if (role === 'cook') return '/cozinha';
    return '/dashboard';
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return '****';
    return `***${digits.slice(-4)}`;
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!name || !domain) return '***';
    return `${name[0] ?? '*'}***@${domain}`;
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  private parseJson<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private authFailure(): HttpException {
    return this.structuredError(HttpStatus.UNAUTHORIZED, 'CPF ou PIN inválidos.', 'AUTH_INVALID');
  }

  private invalidRecoveryCode(): HttpException {
    return this.structuredError(
      HttpStatus.BAD_REQUEST,
      'Código inválido ou expirado.',
      'RECOVERY_CODE_INVALID',
    );
  }

  private structuredError(status: HttpStatus, message: string, code: string): HttpException {
    return new HttpException(
      {
        message,
        message_user: message,
        code,
      },
      status,
    );
  }
}
