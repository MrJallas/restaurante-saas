import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, IsIn } from 'class-validator';
import { PromotionsService } from './promotions.service';

class CreatePromotionDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(['percentage', 'fixed']) discountType!: string;
  @IsInt() discountValue!: number;
  @IsOptional() @IsInt() minOrderCents?: number;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validUntil?: string;
}

class UpdatePromotionDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['percentage', 'fixed']) discountType?: string;
  @IsOptional() @IsInt() discountValue?: number;
  @IsOptional() @IsInt() minOrderCents?: number;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

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
  async create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.promotionsService.delete(id);
  }
}
