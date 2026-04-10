import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';

export interface TenantRequest extends Request {
  tenantSchemaName?: string;
  tenantSlug?: string;
  tenantRestaurantId?: string;
  params: Record<string, string>;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly dataSource: DataSource) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    const slug = req.params.slug;

    if (!slug) {
      throw new HttpException('Slug do restaurante nao informado.', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.dataSource.query(
        'SELECT id, schema_name, is_active FROM public.restaurants WHERE slug = $1',
        [slug],
      );

      if (!result.length) {
        throw new HttpException('Restaurante nao encontrado.', HttpStatus.NOT_FOUND);
      }

      const restaurant = result[0];

      if (!restaurant.is_active) {
        throw new HttpException('Restaurante inativo.', HttpStatus.FORBIDDEN);
      }

      req.tenantSchemaName = restaurant.schema_name;
      req.tenantSlug = slug;
      req.tenantRestaurantId = restaurant.id;

      next();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Erro ao resolver tenant: ${slug}`, err);
      throw new HttpException('Erro ao resolver restaurante.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
