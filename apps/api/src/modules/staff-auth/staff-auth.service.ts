import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService, type AttemptBucket } from '../../infra/redis/redis.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { hashPin, verifyPin, isLegacyPinHash } from '../staff/staff-pin.util';
import {
  issueStaffSessionToken,
  revokeStaffSessions,
  verifyStaffSessionToken,
} from '../../common/auth/staff-session-token';
import { invalidateCachedStaffRole } from '../../common/guards/staff-role-cache';
import { EventsGateway } from '../websocket/events.gateway';

type StaffRole = 'owner' | 'manager' | 'host' | 'waiter' | 'cook' | 'bartender' | 'cashier';

interface StaffAuthRow {
  id: string;
  name: string;
  role: StaffRole;
  pin_hash: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  /** Migration 061 — setada pelo reset do gerente; o change-pin limpa. */
  must_change_pin?: boolean;
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
// Defense-in-depth: lockout por (slug:cpf) INDEPENDENTE de IP. O lock por
// cpf:ip sozinho é derrotado por rotação de IP (botnet / XFF forjável); este
// contador acumula por CPF em qualquer origem, então N falhas globais travam
// o brute-force do PIN mesmo variando o IP a cada tentativa. Limite mais
// folgado (staff legítimo pode errar de vários IPs), mas ainda finito.
const LOGIN_CPF_MAX_ATTEMPTS = 20;
const LOGIN_CPF_WINDOW_SECONDS = 15 * 60;
const LOGIN_CPF_LOCK_SECONDS = 15 * 60;
const RECOVERY_TTL_SECONDS = 10 * 60;
const RESET_TOKEN_TTL_SECONDS = 10 * 60;
const RECOVERY_MAX_ATTEMPTS = 5;
const RECOVERY_ATTEMPTS_TTL_SECONDS = RECOVERY_TTL_SECONDS;
// TROCAR-PIN (2026-07-04): mesma disciplina do login — 5 tentativas de
// currentPin errado por staffId numa janela de 15min → lock de 15min. A
// chave é por staffId (não cpf:ip) porque a rota já exige sessão válida.
const CHANGE_PIN_MAX_ATTEMPTS = 5;
const CHANGE_PIN_WINDOW_SECONDS = 15 * 60;
const CHANGE_PIN_LOCK_SECONDS = 15 * 60;
const DUMMY_PIN_HASH = hashPin('000000');
const PIN_RE = /^\d{4,6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  private async revokeSecuritySessions(staffId: string): Promise<void> {
    try {
      await revokeStaffSessions(this.redis, {
        staffId,
        slug: this.tenantSlug(),
      });
    } finally {
      // Redis revoga HTTP; sockets já autenticados precisam ser expulsos
      // explicitamente porque o gateway valida o token somente no handshake.
      invalidateCachedStaffRole(this.tenantConn, staffId);
      this.events?.disconnectStaff(staffId);
    }
  }

  async login(
    input: { cpf: string; pin: string },
    request: string | { ip: string; userAgent?: string },
  ) {
    const ip = typeof request === 'string' ? request : request.ip;
    const userAgent = typeof request === 'string' ? undefined : request.userAgent;
    const cpf = this.normalizeCpf(input.cpf);
    if (!cpf || !/^\d{4,6}$/.test(input.pin)) {
      throw this.authFailure();
    }

    // A tentativa é reservada ANTES de conferir o PIN; a falha fica contada e o
    // sucesso zera. Contar só depois da conferência deixava uma rajada paralela
    // de palpites passar inteira pela checagem da trava.
    const throttle = this.loginBuckets(cpf, ip);
    if (await this.redis.reserveAttempt(...throttle)) throw this.throttled();

    const staff = await this.findActiveByCpf(cpf);
    const expectedHash = staff?.pin_hash ?? DUMMY_PIN_HASH;
    const pinMatches = verifyPin(input.pin, expectedHash);
    const authenticated = Boolean(staff && pinMatches);

    if (!authenticated) throw this.authFailure();

    // Backfill lazy do hash (OWASP A02): o login é o ÚNICO ponto onde o
    // plaintext do PIN existe junto com um hash que acabou de bater. Se o hash
    // armazenado ainda é o SHA-256 legado, re-hasheia com bcrypt AGORA — sem
    // forçar reset, transparente pro staff. Best-effort: uma falha aqui não
    // pode derrubar o login (o hash legado segue verificando).
    if (isLegacyPinHash(staff!.pin_hash)) {
      await this.backfillPinHash(staff!.id, input.pin);
    }

    await this.redis.clearAttempts(...throttle);

    // Reset pelo gerente (TROCAR-PIN 2026-07-04): staff entra com o PIN
    // temporário mas é FORÇADO pra troca — o FE lê a flag/nextPath e leva
    // pro /trocar-pin; o change-pin limpa a flag.
    const mustChangePin = staff!.must_change_pin === true;

    // Emite o token de sessão de staff vinculado ao staffId/role recém
    // autenticado via PIN. É o segredo verificado server-side que os
    // guards de manager/host passam a exigir (x-staff-token) — o par
    // x-staff-key shared + x-staff-id enumerável não escala mais sozinho.
    //
    // ENFORCEMENT server-side de must_change_pin (P2 hardening): quando a
    // flag está setada, o token carrega mustChangePin=true e os guards de
    // staff o RECUSAM em toda rota privilegiada — só a troca de PIN o aceita
    // (ela verifica o token no service, fora dos guards). Não confia no
    // redirect do FE: PIN temporário resetado não abre nenhuma rota
    // privilegiada até a troca. O change-pin de sucesso emite token NOVO sem
    // a flag, então a restrição some sozinha.
    const session = await issueStaffSessionToken(this.redis, {
      staffId: staff!.id,
      role: staff!.role,
      slug: this.tenantSlug(),
      mustChangePin,
      ip,
      userAgent,
    });

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
      // Token vinculado ao login — o client passa a mandá-lo em
      // `x-staff-token` nas rotas privilegiadas.
      staffToken: session.token,
      staffTokenExpiresIn: session.expiresIn,
      mustChangePin,
      nextPath: mustChangePin ? '/trocar-pin' : this.nextPathForRole(staff!.role),
    };
  }

  /**
   * Troca de PIN LOGADO (TROCAR-PIN, decisão Caleb 2026-07-04). A prova de
   * identidade é dupla: o token de sessão (quem está portando) + o PIN
   * atual (quem conhece o segredo) — token roubado sozinho não troca PIN.
   * Sucesso revoga TODAS as sessões do staff (device perdido/emprestado
   * morre na hora) e emite um token NOVO pra sessão corrente não cair.
   */
  async changePin(input: { token: string | undefined; currentPin: string; newPin: string }) {
    const payload = await verifyStaffSessionToken(this.redis, input.token, this.tenantSlug());
    if (!payload) {
      throw this.structuredError(
        HttpStatus.UNAUTHORIZED,
        'Sessão expirada. Faça login novamente.',
        'AUTH_MISSING',
      );
    }

    if (!PIN_RE.test(input.newPin)) {
      throw this.structuredError(
        HttpStatus.BAD_REQUEST,
        'Novo PIN deve ter 4 a 6 dígitos.',
        'INVALID_PIN',
      );
    }

    // currentPin errado é tentativa: reservada antes da conferência, como no login.
    const throttle = this.changePinBucket(payload.staffId);
    if (await this.redis.reserveAttempt(throttle)) throw this.throttled();

    // O staff vem do TOKEN verificado, nunca de body/header. Dummy hash pra
    // staff inexistente/desativado — comparação sempre roda (timing-safe).
    const staff = await this.findActiveById(payload.staffId);
    const expectedHash = staff?.pin_hash ?? DUMMY_PIN_HASH;
    // Verifica o currentPin detectando o formato (bcrypt novo ou SHA-256
    // legado). O sucesso já grava o newPin como bcrypt logo abaixo, então a
    // troca também migra o hash — sem backfill separado aqui.
    const pinMatches = verifyPin(input.currentPin, expectedHash);

    if (!staff || !pinMatches) {
      throw this.structuredError(
        HttpStatus.UNAUTHORIZED,
        'PIN atual incorreto.',
        'CURRENT_PIN_INVALID',
      );
    }

    await this.redis.clearAttempts(throttle);

    const updated = unwrapRows<{ id: string; name: string; role: StaffRole }>(
      await this.tenantConn.query(
        `UPDATE staff
            SET pin_hash = $1, must_change_pin = false, updated_at = now()
          WHERE id = $2
            AND is_active = true
          RETURNING id, name, role`,
        [hashPin(input.newPin), payload.staffId],
      ),
    );

    if (!updated.length) {
      // Staff sumiu/desativou entre o SELECT e o UPDATE — trata como sessão
      // inválida em vez de fingir sucesso.
      throw this.structuredError(
        HttpStatus.UNAUTHORIZED,
        'Sessão expirada. Faça login novamente.',
        'AUTH_MISSING',
      );
    }

    // Revoga TODAS as sessões (inclusive a corrente) e emite uma nova pra
    // este portador — o proxy troca o cookie e o app segue logado.
    await this.revokeSecuritySessions(payload.staffId);
    const session = await issueStaffSessionToken(this.redis, {
      staffId: updated[0].id,
      role: updated[0].role,
      slug: this.tenantSlug(),
      ip: payload.ip,
      userAgent: payload.userAgent,
    });

    return {
      message_user: 'PIN atualizado.',
      code: 'PIN_CHANGED',
      staff: {
        id: updated[0].id,
        name: updated[0].name,
        role: updated[0].role,
      },
      staffToken: session.token,
      staffTokenExpiresIn: session.expiresIn,
      nextPath: this.nextPathForRole(updated[0].role),
    };
  }

  /**
   * Logout do staff (P1-E re-scan, decisão Caleb 2026-07-04). O logout só
   * limpava o localStorage — a sessão no Redis + o cookie httpOnly
   * `staff_token` seguiam vivos por até 12h, então num kiosk/device
   * compartilhado reabrir o browser cavalgava o cookie e reentrava.
   *
   * Verifica o `x-staff-token` (o proxy injeta a partir do cookie) e, se
   * válido, REVOGA TODAS as sessões do staff — em device compartilhado é
   * mais seguro derrubar tudo do que só a sessão corrente. O proxy web-staff
   * limpa o cookie independentemente da resposta. É SEMPRE idempotente:
   * token ausente/expirado/de outro tenant não revoga nada e ainda responde
   * 200 (logout nunca deve falhar — falhar prenderia o usuário logado).
   */
  async logout(token: string | undefined) {
    const payload = await verifyStaffSessionToken(this.redis, token, this.tenantSlug());
    if (payload) {
      await this.revokeSecuritySessions(payload.staffId);
    }
    return { message_user: 'Sessão encerrada.', code: 'LOGGED_OUT' };
  }

  /**
   * Reset de PIN pelo GERENTE (TROCAR-PIN, decisão Caleb 2026-07-04) —
   * rota manager-only. Gera PIN temporário de 6 dígitos (devolvido UMA vez
   * no body; o gerente fala pro staff), seta `must_change_pin = true` (o
   * login força a troca) e revoga todas as sessões do alvo.
   */
  async managerResetPin(targetStaffId: string) {
    if (!UUID_RE.test(targetStaffId)) {
      throw this.staffNotFound();
    }

    const target = unwrapRows<{ role: StaffRole }>(
      await this.tenantConn.query(
        `SELECT role FROM staff WHERE id = $1 AND is_active = true LIMIT 1`,
        [targetStaffId],
      ),
    );
    if (!target.length) {
      throw this.staffNotFound();
    }
    if (target[0].role === 'owner') {
      throw this.structuredError(
        HttpStatus.FORBIDDEN,
        'A conta do dono é protegida e não aceita reset administrativo de PIN.',
        'OWNER_PROTECTED',
      );
    }

    const tempPin = String(randomInt(100000, 1000000));

    const updated = unwrapRows<{ id: string; name: string }>(
      await this.tenantConn.query(
        `UPDATE staff
            SET pin_hash = $1, must_change_pin = true, updated_at = now()
          WHERE id = $2
            AND is_active = true
            AND role <> 'owner'
          RETURNING id, name`,
        [hashPin(tempPin), targetStaffId],
      ),
    );

    if (!updated.length) {
      throw this.staffNotFound();
    }

    await this.revokeSecuritySessions(targetStaffId);

    return {
      message_user: 'PIN temporário gerado. Informe ao funcionário — não será exibido de novo.',
      code: 'PIN_RESET_TEMP',
      tempPin,
      staff: {
        id: updated[0].id,
        name: updated[0].name,
      },
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
    // Novo código emitido → zera o contador de tentativas do fluxo anterior.
    await this.redis.del(this.recoveryAttemptsKey(cpf));

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

    // Throttle fail-closed espelhando login(): sem isto, o código de 6 dígitos
    // (~1M combinações) poderia ser varrido dentro da janela de 10 min sem
    // qualquer lock → takeover de qualquer staff/manager. Conta cada tentativa
    // (INCR+EXPIRE atômico) ANTES de validar; ao estourar o limite, deleta a
    // recoveryKey pra invalidar o código em vez de deixá-lo vivo por 10 min.
    const attemptsKey = this.recoveryAttemptsKey(cpf);
    const attempts = await this.redis.incrWithExpiry(attemptsKey, RECOVERY_ATTEMPTS_TTL_SECONDS);
    if (attempts > RECOVERY_MAX_ATTEMPTS) {
      await this.redis.del(this.recoveryKey(cpf));
      throw this.recoveryThrottled();
    }

    const raw = await this.redis.get(this.recoveryKey(cpf));
    const payload = raw ? this.parseJson<RecoveryPayload>(raw) : null;
    if (!payload || payload.cpf !== cpf || !this.safeEqual(payload.code, input.code)) {
      // Ao atingir o limite exato numa tentativa errada, rotaciona/invalida o
      // código pra bruteforce não continuar no mesmo valor.
      if (attempts >= RECOVERY_MAX_ATTEMPTS) {
        await this.redis.del(this.recoveryKey(cpf));
      }
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
    await this.redis.del(this.recoveryAttemptsKey(cpf));

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

    // unwrapRows: UPDATE…RETURNING chega como [rows, count] — o cast cru
    // fazia updated.length ser sempre 2 e o guard abaixo nunca disparar
    // (reset de PIN que não casava staff/cpf reportava sucesso).
    const updated = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE staff
            SET pin_hash = $1, updated_at = now()
          WHERE id = $2
            AND cpf = $3
            AND is_active = true
          RETURNING id`,
        [hashPin(input.pin), payload.staffId, payload.cpf],
      ),
    );

    await this.redis.del(this.resetTokenKey(input.resetToken));

    if (!updated.length) {
      throw this.structuredError(
        HttpStatus.BAD_REQUEST,
        'Código expirado. Solicite outro código.',
        'RECOVERY_TOKEN_INVALID',
      );
    }

    // Recuperação de credencial é um evento de comprometimento presumido:
    // toda sessão HTTP e todo socket antigo deve morrer imediatamente.
    await this.revokeSecuritySessions(payload.staffId);

    return {
      message_user: 'PIN atualizado.',
      code: 'PIN_RESET',
    };
  }

  private async findActiveByCpf(cpf: string): Promise<StaffAuthRow | null> {
    const rows = (await this.tenantConn.query(
      `SELECT id, name, role, pin_hash, cpf, phone, email, must_change_pin
         FROM staff
        WHERE cpf = $1
          AND is_active = true
        LIMIT 1`,
      [cpf],
    )) as StaffAuthRow[];
    return rows[0] ?? null;
  }

  /**
   * Backfill lazy do hash de PIN (OWASP A02). Re-hasheia o PIN (já verificado
   * no login) com bcrypt e grava — mas SÓ enquanto o hash ainda for legado
   * (`AND pin_hash NOT LIKE '$2%'`), pra não competir com uma troca/reset
   * concorrente que já modernizou o hash. Best-effort: engole erro pra jamais
   * derrubar um login que já autenticou.
   */
  private async backfillPinHash(staffId: string, plainPin: string): Promise<void> {
    try {
      await this.tenantConn.query(
        `UPDATE staff
            SET pin_hash = $1, updated_at = now()
          WHERE id = $2
            AND is_active = true
            AND pin_hash NOT LIKE '$2%'`,
        [hashPin(plainPin), staffId],
      );
    } catch {
      // Migração é oportunística — próximo login tenta de novo.
    }
  }

  private async findActiveById(staffId: string): Promise<StaffAuthRow | null> {
    const rows = (await this.tenantConn.query(
      `SELECT id, name, role, pin_hash, must_change_pin
         FROM staff
        WHERE id = $1
          AND is_active = true
        LIMIT 1`,
      [staffId],
    )) as StaffAuthRow[];
    return rows[0] ?? null;
  }

  // Login: por (slug:cpf:ip) e, sem IP, por (slug:cpf) — este não é
  // derrotado por rotação de IP (ver LOGIN_CPF_MAX_ATTEMPTS).
  private loginBuckets(cpf: string, ip: string): AttemptBucket[] {
    return [
      {
        key: `staff-auth:login:${this.tenantSlug()}:${cpf}:${ip}`,
        max: LOGIN_MAX_ATTEMPTS,
        windowSeconds: LOGIN_WINDOW_SECONDS,
        lockSeconds: LOGIN_LOCK_SECONDS,
      },
      {
        key: `staff-auth:login:cpf:${this.tenantSlug()}:${cpf}`,
        max: LOGIN_CPF_MAX_ATTEMPTS,
        windowSeconds: LOGIN_CPF_WINDOW_SECONDS,
        lockSeconds: LOGIN_CPF_LOCK_SECONDS,
      },
    ];
  }

  // Troca de PIN: por staffId (a rota exige sessão, então o sujeito já está
  // identificado; cpf:ip não agrega aqui).
  private changePinBucket(staffId: string): AttemptBucket {
    return {
      key: `staff-auth:change-pin:${this.tenantSlug()}:${staffId}`,
      max: CHANGE_PIN_MAX_ATTEMPTS,
      windowSeconds: CHANGE_PIN_WINDOW_SECONDS,
      lockSeconds: CHANGE_PIN_LOCK_SECONDS,
    };
  }

  private recoveryKey(cpf: string): string {
    return `staff-auth:recovery:${this.tenantSlug()}:${cpf}`;
  }

  private recoveryAttemptsKey(cpf: string): string {
    return `staff-auth:recovery:attempts:${this.tenantSlug()}:${cpf}`;
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
    if (role === 'owner' || role === 'manager') return '/manager';
    if (role === 'host') return '/host';
    if (role === 'waiter') return '/waiter';
    if (role === 'cook') return '/cozinha';
    if (role === 'bartender') return '/bar';
    if (role === 'cashier') return '/cashier';
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

  private throttled(): HttpException {
    return this.structuredError(
      HttpStatus.TOO_MANY_REQUESTS,
      'Muitas tentativas. Aguarde alguns minutos.',
      'AUTH_THROTTLED',
    );
  }

  private recoveryThrottled(): HttpException {
    return this.structuredError(
      HttpStatus.TOO_MANY_REQUESTS,
      'Muitas tentativas. Solicite outro código.',
      'RECOVERY_THROTTLED',
    );
  }

  private staffNotFound(): HttpException {
    return this.structuredError(
      HttpStatus.NOT_FOUND,
      'Funcionário não encontrado.',
      'STAFF_NOT_FOUND',
    );
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
