import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { Request } from 'express';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { OrdersService } from './orders.service';

class ReorderKitchenDto {
  @IsArray()
  @ArrayMaxSize(25)
  @IsUUID(undefined, { each: true })
  orderIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class RespondKitchenReorderDto {
  @IsIn(['accept', 'next'])
  response!: 'accept' | 'next';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsUUID(undefined, { each: true })
  protectedOrderIds?: string[];
}

@Controller(':slug/kitchen')
@UseGuards(StaffOnlyGuard)
export class KitchenController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Get('queue')
  async queue() {
    const orders = await this.ordersService.getKitchenQueue();
    return { orders };
  }

  @Post('reorder')
  async reorder(@Param('slug') slug: string, @Body() dto: ReorderKitchenDto, @Req() req: Request) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.ordersService.reorderKitchenQueue(dto.orderIds, dto.reason ?? null, staffId, slug);
  }

  @Post('reorder-requests')
  async requestReorder(
    @Param('slug') slug: string,
    @Body() dto: ReorderKitchenDto,
    @Req() req: Request,
  ) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.ordersService.requestKitchenReorder(
      dto.orderIds,
      dto.reason ?? null,
      staffId,
      slug,
    );
  }

  @Get('reorder-requests/pending')
  async pendingReorderRequests() {
    return this.ordersService.getPendingKitchenReorderRequests();
  }

  @Get('reorder-requests/:id')
  async getReorderRequest(@Param('id') id: string) {
    return this.ordersService.getKitchenReorderRequest(id);
  }

  @Post('reorder-requests/:id/respond')
  async respondReorderRequest(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RespondKitchenReorderDto,
    @Req() req: Request,
  ) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.ordersService.respondKitchenReorderRequest(
      id,
      dto.response,
      dto.protectedOrderIds ?? [],
      staffId,
      slug,
    );
  }
}
