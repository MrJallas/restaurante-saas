import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CustomersService } from '../customers/customers.service';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { LgpdService } from './lgpd.service';

class CreateLgpdDto {
  @IsIn(['erasure', 'export'])
  kind!: 'erasure' | 'export';

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  consentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  originalMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  chipLabel?: string;
}

class ListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'in_progress', 'fulfilled', 'rejected'])
  status?: string;

  @IsOptional()
  @IsIn(['erasure', 'export'])
  kind?: string;
}

@Controller(':slug/lgpd-requests')
export class LgpdController {
  constructor(
    private readonly service: LgpdService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * `POST /lgpd-requests` · customer creates an erasure (or future export)
   * request. Synchronous fulfillment for erasure; protocol returned right
   * away for the customer to keep.
   *
   * Round 7 (B-NEW-23): customerId derivado do cookie `recognition_token`
   * em vez de aceitar via body. Antes: customer A com session passava
   * `customerId: <vítima>` e o serviço executava erasure síncrono
   * deletando chat history da vítima no Mongo (mass-destruction LGPD via
   * session token). Variação não-fixada do B-NEW-9 (chat-history) que
   * ficou só no chat-history controller.
   *
   * Atacante NÃO consegue mais passar UUID/CPF/e-mail alheio: customerId do
   * body é ignorado, CPF/e-mail nem pertencem ao DTO público, e o service lê
   * o CPF canônico da linha autenticada. O cadastro não tem e-mail canônico,
   * então pedidos originados pelo cliente persistem esse campo como null.
   */
  @Post()
  @UseGuards(SessionGuard)
  async create(
    @Param('slug') slug: string,
    @Tenant() tenantId: string,
    @Body() dto: CreateLgpdDto,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.resolveCallerCustomerId(req);
    const result = await this.service.createCustomerRequest(
      {
        kind: dto.kind,
        customerId: callerCustomerId,
        notes: dto.notes,
      },
      tenantId,
      slug,
    );
    // O protocolo fica persistido como pending, mas a chamada não pode parecer
    // sucesso ao FE/AI enquanto qualquer store estiver offline ou parcial.
    if (dto.kind === 'erasure' && result.status !== 'fulfilled') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  /** Retry manual enquanto o worker durável ainda não existe. */
  @Post(':id/retry')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async retry(
    @Param('slug') slug: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Tenant() tenantId: string,
  ) {
    const result = await this.service.retryRequest(id, tenantId, slug);
    if (result.status !== 'fulfilled') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  private async resolveCallerCustomerId(req: Request): Promise<string> {
    const token =
      (req as Request & { cookies?: Record<string, string> }).cookies?.recognition_token ?? null;
    if (!token) {
      throw new HttpException(
        'Identificação ausente. Faça login pra criar um pedido LGPD.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const resolved = await this.customers.resolveByRecognitionToken(token);
    if (!resolved) {
      throw new HttpException('Identificação inválida.', HttpStatus.UNAUTHORIZED);
    }
    return resolved.customerId;
  }

  /**
   * `GET /lgpd-requests` · manager view.
   *
   * Round 16 (LGPD-list-hardening): adicionado ManagerOnlyGuard. Antes
   * StaffOnly só (qualquer waiter/cook listava todos requests com
   * customer_cpf no payload — leak LGPD). Manager DB role lookup já
   * existe no guard (round 7).
   */
  @Get()
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async list(@Query() q: ListQueryDto) {
    return this.service.list({ status: q.status, kind: q.kind });
  }
}
