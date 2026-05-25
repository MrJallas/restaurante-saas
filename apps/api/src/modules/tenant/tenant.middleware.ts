import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import { recordPgQuery } from '../../common/performance/request-timing';

export interface TenantRequest extends Request {
  tenantSchemaName?: string;
  tenantSlug?: string;
  tenantRestaurantId?: string;
  params: Record<string, string>;
}

interface TenantLookupRow {
  id: string;
  schema_name: string;
  is_active: boolean;
}

interface CachedTenantLookup {
  expiresAt: number;
  restaurant: TenantLookupRow;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);
  private readonly lookupCache = new Map<string, CachedTenantLookup>();
  private readonly lookupCacheTtlMs = Number(
    process.env.TENANT_LOOKUP_CACHE_TTL_MS ?? 5_000,
  );

  constructor(private readonly dataSource: DataSource) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    const slug = req.params.slug;

    if (slug === 'qr') {
      return next();
    }

    if (!slug) {
      throw new HttpException('Slug do restaurante nao informado.', HttpStatus.BAD_REQUEST);
    }

    try {
      const restaurant = await this.lookupRestaurant(slug);

      if (!restaurant) {
        throw new HttpException('Restaurante nao encontrado.', HttpStatus.NOT_FOUND);
      }

      if (!restaurant.is_active) {
        throw new HttpException('Restaurante inativo.', HttpStatus.FORBIDDEN);
      }

      // Defense-in-depth contra SQL injection via schema_name. O valor
      // vem da tabela `public.restaurants.schema_name` (entrada admin)
      // e e string-interpolado em `SET search_path = '${schemaName}'`
      // dentro do TenantConnectionProvider. Postgres nao aceita
      // search_path parametrizado, entao validamos o formato. Schema
      // names PG validos sao [a-z_][a-z0-9_]*. Se um admin maluco
      // cadastrar `restaurant'; DROP TABLE...`, recusamos a request.
      const schemaName: string = restaurant.schema_name;
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) {
        this.logger.error(
          `Schema name invalido para slug ${slug}: ${schemaName}`,
        );
        throw new HttpException(
          'Configuracao do restaurante invalida.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      req.tenantSchemaName = schemaName;
      req.tenantSlug = slug;
      req.tenantRestaurantId = restaurant.id;

      next();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Erro ao resolver tenant: ${slug}`, err);
      throw new HttpException('Erro ao resolver restaurante.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async lookupRestaurant(slug: string): Promise<TenantLookupRow | null> {
    const now = Date.now();
    const cached = this.lookupCache.get(slug);
    if (cached && cached.expiresAt > now) {
      return cached.restaurant;
    }
    if (cached) {
      this.lookupCache.delete(slug);
    }

    const startedAt = process.hrtime.bigint();
    let result: TenantLookupRow[];
    try {
      result = await this.dataSource.query(
        'SELECT id, schema_name, is_active FROM public.restaurants WHERE slug = $1',
        [slug],
      );
    } finally {
      recordPgQuery(startedAt);
    }

    const restaurant = result[0] ?? null;
    if (
      restaurant &&
      Number.isFinite(this.lookupCacheTtlMs) &&
      this.lookupCacheTtlMs > 0
    ) {
      this.lookupCache.set(slug, {
        restaurant,
        expiresAt: now + this.lookupCacheTtlMs,
      });
    }
    return restaurant;
  }
}
