import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
import { CallerResolverService } from '../../common/services/caller-resolver.service';
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
  constructor(
    private readonly service: OrderRatingsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 8 (B-NEW-27): customerId derivado do cookie. Antes customer A
   * passava `customerId: <vítima>` e a review era atribuída a B —
   * review fraud (rating 5★ em nome de B sem ela saber, ou 1★ pra
   * sabotar reputação dela com manager).
   */
  @Post()
  @UseGuards(SessionGuard)
  async submit(@Body() dto: SubmitRatingDto, @Req() req: Request) {
    const callerCustomerId = await this.callerResolver.requireCustomerId(req);
    return this.service.submit({
      orderId: dto.orderId,
      customerId: callerCustomerId,
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
