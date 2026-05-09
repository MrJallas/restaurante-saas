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
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
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

  /**
   * Round 10 (B-NEW-47): exige tableSessionId via SessionGuard +
   * JOIN orders → table_session_id no service. Antes: customer A em
   * mesa X conhecendo orderId de mesa Y lia review + comment (até
   * 2000 chars) — PII risk se customer escreveu CPF/telefone no
   * comment. Mesma família B-NEW-17 (feedbacks) que foi fixada em
   * round 5; order-ratings ficou.
   */
  @Get(':orderId')
  @UseGuards(SessionGuard)
  async getByOrderId(
    @Param('orderId') orderId: string,
    @Session() session: SessionData,
  ) {
    return this.service.getByOrderIdForSession(orderId, session.sessionId);
  }
}
