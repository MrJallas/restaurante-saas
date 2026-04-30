import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';

const VALID_ROLES = ['waiter', 'cook', 'manager'];

// Limite de tentativas falhas em verifyPin antes de bloquear o
// staff_id por LOCKOUT_SECONDS. Sem isso o PIN de 4 digitos
// (10^4 combinacoes) era brute-forcavel em segundos. P1 do bug-hunt.
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60; // 5 minutos

function hashPin(pin: string): string {
  // SHA-256 sem salt e fraco contra rainbow tables, mas migrar pra
  // bcrypt requer rehash de PINs existentes. Foi spawnado em task
  // separada — aqui mantemos SHA-256 + throttling agressivo no
  // verifyPin como mitigacao imediata.
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

@Injectable()
export class StaffService {
  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
  ) {}

  async list(role?: string, activeOnly = false) {
    const where: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (role) {
      where.push(`role = $${idx++}`);
      params.push(role);
    }
    if (activeOnly) {
      where.push('is_active = true');
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.tenantConn.query(
      `SELECT id, name, role, is_active, created_at, updated_at FROM staff ${whereClause} ORDER BY name ASC`,
      params,
    );
  }

  async getById(id: string) {
    const rows = (await this.tenantConn.query(
      `SELECT id, name, role, is_active, created_at, updated_at FROM staff WHERE id = $1`,
      [id],
    )) as unknown[];
    if (!rows.length) throw new NotFoundException('Funcionario nao encontrado.');
    return rows[0];
  }

  async create(data: { name: string; role: string; pin: string }) {
    if (!VALID_ROLES.includes(data.role)) {
      throw new BadRequestException('Cargo invalido.');
    }
    if (!/^\d{4,6}$/.test(data.pin)) {
      throw new BadRequestException('PIN deve ter 4-6 digitos.');
    }
    const rows = (await this.tenantConn.query(
      `INSERT INTO staff (name, role, pin_hash) VALUES ($1, $2, $3)
       RETURNING id, name, role, is_active, created_at, updated_at`,
      [data.name, data.role, hashPin(data.pin)],
    )) as unknown[];
    return rows[0];
  }

  async update(
    id: string,
    data: Partial<{ name: string; role: string; pin: string; isActive: boolean }>,
  ) {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      params.push(data.name);
    }
    if (data.role !== undefined) {
      if (!VALID_ROLES.includes(data.role)) {
        throw new BadRequestException('Cargo invalido.');
      }
      setClauses.push(`role = $${idx++}`);
      params.push(data.role);
    }
    if (data.pin !== undefined) {
      if (!/^\d{4,6}$/.test(data.pin)) {
        throw new BadRequestException('PIN deve ter 4-6 digitos.');
      }
      setClauses.push(`pin_hash = $${idx++}`);
      params.push(hashPin(data.pin));
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${idx++}`);
      params.push(data.isActive);
    }

    if (!setClauses.length) return this.getById(id);

    setClauses.push(`updated_at = now()`);
    params.push(id);

    const rows = (await this.tenantConn.query(
      `UPDATE staff SET ${setClauses.join(', ')} WHERE id = $${idx}
       RETURNING id, name, role, is_active, created_at, updated_at`,
      params,
    )) as unknown[];

    if (!rows.length) throw new NotFoundException('Funcionario nao encontrado.');
    return rows[0];
  }

  async delete(id: string) {
    await this.tenantConn.query(`DELETE FROM staff WHERE id = $1`, [id]);
    return { deleted: true };
  }

  async verifyPin(id: string, pin: string): Promise<boolean> {
    // Throttle: bloqueia por 5min apos 5 tentativas falhas. Conta
    // por staffId — atacante rotativo de IPs ainda enfrenta o
    // mesmo limite. 429 distinto de {valid:false} pra UI mostrar
    // mensagem clara.
    const attemptsKey = `staff:pin_attempts:${id}`;
    const lockKey = `staff:pin_lock:${id}`;

    if (await this.redis.get(lockKey)) {
      throw new HttpException(
        'Muitas tentativas. Tente novamente em alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const rows = (await this.tenantConn.query(
      `SELECT pin_hash FROM staff WHERE id = $1 AND is_active = true`,
      [id],
    )) as { pin_hash: string }[];

    if (!rows.length) return false;

    const ok = timingSafeEqualHex(rows[0].pin_hash, hashPin(pin));

    if (ok) {
      // Sucesso reseta o contador.
      await this.redis.del(attemptsKey);
      return true;
    }

    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1) {
      // Primeira falha: TTL inicial pra que tentativas antigas nao
      // contem indefinidamente.
      await this.redis.expire(attemptsKey, LOCKOUT_SECONDS);
    }
    if (attempts >= MAX_PIN_ATTEMPTS) {
      await this.redis.set(lockKey, '1', LOCKOUT_SECONDS);
      await this.redis.del(attemptsKey);
    }
    return false;
  }
}
