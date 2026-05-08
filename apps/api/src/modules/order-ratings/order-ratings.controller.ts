import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { OrderRatingsService } from './order-ratings.service';

class SubmitRatingDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

@Controller(':slug/order-ratings')
export class OrderRatingsController {
  constructor(private readonly service: OrderRatingsService) {}

  @Post()
  @UseGuards(SessionGuard)
  async submit(@Body() dto: SubmitRatingDto) {
    return this.service.submit({
      orderId: dto.orderId,
      customerId: dto.customerId,
      visitId: dto.visitId,
      rating: dto.rating,
      comment: dto.comment,
    });
  }

  @Get(':orderId')
  @UseGuards(SessionGuard)
  async getByOrderId(@Param('orderId') orderId: string) {
    return this.service.getByOrderId(orderId);
  }
}
