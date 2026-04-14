import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsOptional,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { OrdersService } from './orders.service';

class OrderItemExtraDto {
  @IsString()
  @IsNotEmpty()
  extraId!: string;
}

class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  menuItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraIds?: string[];
}

class CreateOrderDto {
  @IsIn(['table', 'individual'])
  billingMode!: 'table' | 'individual';

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

class UpdateStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['confirmed', 'preparing', 'ready', 'delivered', 'cancelled'])
  status!: string;

  @IsOptional()
  @IsString()
  changedBy?: string;
}

@Controller(':slug/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(SessionGuard)
  async createOrder(
    @Body() dto: CreateOrderDto,
    @Session() session: SessionData,
  ) {
    return this.ordersService.createOrder(
      session.sessionId,
      dto.visitId || null,
      dto.billingMode,
      dto.items,
      dto.notes,
    );
  }

  @Get()
  @UseGuards(SessionGuard)
  async getOrders(
    @Session() session: SessionData,
    @Query('billingMode') billingMode?: string,
    @Query('visitId') visitId?: string,
  ) {
    const orders = await this.ordersService.getOrdersBySession(
      session.sessionId,
      billingMode,
      visitId,
    );
    return { orders };
  }

  @Get('bill')
  @UseGuards(SessionGuard)
  async getBill(
    @Session() session: SessionData,
    @Query('mode') mode: 'table' | 'individual' = 'table',
    @Query('visitId') visitId?: string,
  ) {
    return this.ordersService.getBill(session.sessionId, mode, visitId);
  }

  @Patch(':orderId/status')
  @UseGuards(SessionGuard)
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(
      orderId,
      dto.status,
      dto.changedBy || 'system',
    );
  }
}
