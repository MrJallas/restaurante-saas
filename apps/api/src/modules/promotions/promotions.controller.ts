import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
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
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
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
 * pessoa criava promoção 100% off em qualquer tenant. Agora exigem
 * `x-staff-key`. P0 do bug-hunt round 3.
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
  @UseGuards(StaffOrSessionGuard)
  async create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(StaffOrSessionGuard)
  async update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(StaffOrSessionGuard)
  async delete(@Param('id') id: string) {
    return this.promotionsService.delete(id);
  }
}
