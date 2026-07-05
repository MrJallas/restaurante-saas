import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { PromotionsService } from './promotions.service';

class CreatePromotionDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsIn(['percentage', 'fixed']) discountType!: string;
  // percentage: 1-100, fixed: 1-1_000_000 cents (R$10k). Sem isso era
  // possivel inserir desconto de 100%.
  @IsInt() @Min(1) @Max(1_000_000) discountValue!: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) minOrderCents?: number;
  @IsOptional() @IsString() @MaxLength(40) validFrom?: string;
  @IsOptional() @IsString() @MaxLength(40) validUntil?: string;
}

class UpdatePromotionDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsIn(['percentage', 'fixed']) discountType?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) discountValue?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) minOrderCents?: number;
  @IsOptional() @IsString() @MaxLength(40) validFrom?: string;
  @IsOptional() @IsString() @MaxLength(40) validUntil?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Promotions: GET e endpoint publico (clientes precisam ver descontos
 * disponiveis). Mutacoes (POST/PATCH/DELETE) eram publicas — qualquer
 * pessoa criava promoção 100% off em qualquer tenant.
 *
 * Round 5 (B-NEW-8): trocado StaffOrSessionGuard → StaffOnlyGuard. O
 * guard anterior aceitava `x-session-token` válido (qualquer customer
 * com mesa ativa) — comentário do round 3 alegava "agora exigem
 * x-staff-key" mas era falso. Customer fazia PATCH/DELETE de promotion
 * via session token e ganhava 100% off. Agora exclusivamente staff
 * (`x-staff-key`).
 *
 * Round 8 (B-NEW-*): privilege escalation staff→manager. StaffOnlyGuard
 * NÃO checa role — retorna true pra QUALQUER x-staff-token válido (todo
 * role loga com CPF+PIN) ou o x-staff-key compartilhado. Um garçom
 * criava 100%-off ou apagava as promoções legítimas do gerente. Promoção
 * é precificação de GESTÃO (único consumidor FE de mutação é o dashboard
 * do gerente). Fix: as 3 mutações ganham ManagerOnlyGuard — mesmo par das
 * irmãs de mutação de gestão (staff/courtesies/vip/…). GET list/getById
 * seguem públicos: o CLIENTE precisa ver os descontos disponíveis.
 */
@Controller(':slug/promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  async list(@Query('activeOnly') activeOnly?: string) {
    const promos = await this.promotionsService.list(activeOnly === 'true');
    return { promotions: promos };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.promotionsService.getById(id);
  }

  @Post()
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async delete(@Param('id') id: string) {
    return this.promotionsService.delete(id);
  }
}
