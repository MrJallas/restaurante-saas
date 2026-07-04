import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  ValidateNested,
  IsArray,
  IsInt,
  Min,
  Max,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { PaymentsService, SplitAllocation } from './payments.service';

class SplitAllocationDto implements SplitAllocation {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  // 10 milhoes de centavos = R$ 100.000 — teto absurdo pra qualquer
  // mesa real. Sem isso o validador `Math.abs(sum - totalCents) > N`
  // podia ser falsificado por overflow de floating-point.
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  amountCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;
}

class RequestPaymentDto {
  @IsIn(['table', 'individual'])
  mode!: 'table' | 'individual';

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsIn(['pix', 'card', 'cash', 'credit', 'debit'])
  method!: string;

  @IsOptional()
  @IsIn(['equal', 'by_item', 'custom'])
  splitMode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitAllocationDto)
  allocations?: SplitAllocationDto[];
}

class ConfirmPaymentDto {
  @IsOptional()
  @IsString()
  pspTransactionId?: string;
}

class ComputeSplitDto {
  @IsIn(['equal', 'by_item', 'custom'])
  mode!: string;

  // Cap em 50 participantes — cobre mesa de festa com folga e evita
  // DoS via array gigante consumindo CPU no computeSplit.
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  participants!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SplitAllocationDto)
  allocations?: SplitAllocationDto[];
}

class NotifySplitDto {
  @IsIn(['equal', 'by_item', 'custom'])
  mode!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SplitAllocationDto)
  allocations!: SplitAllocationDto[];
}

@Controller(':slug/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(SessionGuard)
  async requestPayment(@Body() dto: RequestPaymentDto, @Session() session: SessionData) {
    return this.paymentsService.requestPayment(
      session.sessionId,
      dto.visitId || null,
      dto.mode,
      dto.method,
      {
        splitMode: dto.splitMode,
        allocations: dto.allocations,
      },
    );
  }

  /**
   * Customer-initiated confirm. A04-PAY-01: rodando sob SessionGuard,
   * QUALQUER cliente da mesa pode chamar isso — e NAO existe webhook de PSP
   * no codigo. Por isso o service NAO marca como pago aqui: sem a flag de
   * mock (PAYMENTS_ALLOW_CLIENT_CONFIRM), o confirm apenas registra
   * 'awaiting_settlement' (aguardando compensacao) — nunca 'confirmed'/
   * paid_at. O status pago de verdade so deve vir de um webhook de PSP
   * autenticado ou de confirmacao manual de staff/manager. O service ainda
   * valida (a) ownership por table_session_id e (b) expires_at < now.
   */
  @Post(':paymentId/confirm')
  @UseGuards(SessionGuard)
  async confirmPayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: ConfirmPaymentDto,
    @Session() session: SessionData,
  ) {
    return this.paymentsService.confirmPayment(paymentId, session.sessionId, dto.pspTransactionId);
  }

  /**
   * Customer-initiated cancel of their own pending Pix (S9b ← voltar).
   */
  @Patch(':paymentId/cancel')
  @UseGuards(SessionGuard)
  async cancelPayment(@Param('paymentId') paymentId: string, @Session() session: SessionData) {
    return this.paymentsService.cancelPayment(paymentId, session.sessionId);
  }

  /**
   * Server-side split calculation (SP1 helper). Kept separate from
   * requestPayment so the UI can show the breakdown before anyone commits
   * to paying.
   */
  @Post('bill/split/compute')
  @UseGuards(SessionGuard)
  async computeSplit(@Body() dto: ComputeSplitDto, @Session() session: SessionData) {
    return this.paymentsService.computeSplit(
      session.sessionId,
      dto.mode,
      dto.participants,
      dto.allocations,
    );
  }

  /**
   * SP1 "Enviar resumo" — notify the table/staff without charging anyone.
   */
  @Post('bill/split/notify')
  @UseGuards(SessionGuard)
  async notifySplit(@Body() dto: NotifySplitDto, @Session() session: SessionData) {
    return this.paymentsService.notifySplit(session.sessionId, dto.mode, dto.allocations);
  }

  @Get()
  @UseGuards(SessionGuard)
  async getSessionPayments(@Session() session: SessionData) {
    const payments = await this.paymentsService.getSessionPayments(session.sessionId);
    return { payments };
  }

  @Get(':paymentId')
  @UseGuards(SessionGuard)
  async getPaymentStatus(@Param('paymentId') paymentId: string, @Session() session: SessionData) {
    // Passa session pra que o service filtre por ownership; antes,
    // qualquer cliente autenticado podia ler QR Code Pix e
    // pix_copy_paste de pagamentos de OUTRA mesa adivinhando o UUID
    // (P1 do bug-hunt).
    return this.paymentsService.getPaymentStatus(paymentId, session.sessionId);
  }
}
