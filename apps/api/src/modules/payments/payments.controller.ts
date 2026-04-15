import { Controller, Post, Get, Param, Body, Query, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { PaymentsService } from './payments.service';

class RequestPaymentDto {
  @IsIn(['table', 'individual'])
  mode!: 'table' | 'individual';

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsIn(['pix', 'card', 'cash'])
  method!: string;
}

class ConfirmPaymentDto {
  @IsOptional()
  @IsString()
  pspTransactionId?: string;
}

@Controller(':slug/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(SessionGuard)
  async requestPayment(
    @Body() dto: RequestPaymentDto,
    @Session() session: SessionData,
  ) {
    return this.paymentsService.requestPayment(
      session.sessionId,
      dto.visitId || null,
      dto.mode,
      dto.method,
    );
  }

  @Post(':paymentId/confirm')
  async confirmPayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.paymentsService.confirmPayment(paymentId, dto.pspTransactionId);
  }

  @Get(':paymentId')
  @UseGuards(SessionGuard)
  async getPaymentStatus(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getPaymentStatus(paymentId);
  }

  @Get()
  @UseGuards(SessionGuard)
  async getSessionPayments(@Session() session: SessionData) {
    const payments = await this.paymentsService.getSessionPayments(session.sessionId);
    return { payments };
  }
}
