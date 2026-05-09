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
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CustomersService } from '../customers/customers.service';
import { LgpdService } from './lgpd.service';

class CreateLgpdDto {
  @IsIn(['erasure', 'export'])
  kind!: 'erasure' | 'export';

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Matches(/^\d{11}$/)
  customerCpf?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
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
   * Atacante NÃO consegue mais passar UUID alheio: dto.customerId é
   * IGNORADO; sempre usa caller.customerId resolvido do cookie.
   */
  @Post()
  @UseGuards(SessionGuard)
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateLgpdDto,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.resolveCallerCustomerId(req);
    return this.service.createRequest(
      {
        kind: dto.kind,
        customerId: callerCustomerId,
        customerCpf: dto.customerCpf ?? null,
        customerEmail: dto.customerEmail ?? null,
        notes: dto.notes,
      },
      slug,
    );
  }

  private async resolveCallerCustomerId(req: Request): Promise<string> {
    const token =
      (req as Request & { cookies?: Record<string, string> }).cookies
        ?.recognition_token ?? null;
    if (!token) {
      throw new HttpException(
        'Identificação ausente. Faça login pra criar um pedido LGPD.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const resolved = await this.customers.resolveByRecognitionToken(token);
    if (!resolved) {
      throw new HttpException(
        'Identificação inválida.',
        HttpStatus.UNAUTHORIZED,
      );
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
