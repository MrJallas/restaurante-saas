import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  ValidateNested,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { PaymentsService, SplitAllocation } from './payments.service';

class SplitAllocationDto implements SplitAllocation {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsOptional()
  @IsString()
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

  @IsArray()
  @IsString({ each: true })
  participants!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitAllocationDto)
  allocations?: SplitAllocationDto[];
}

class NotifySplitDto {
  @IsIn(['equal', 'by_item', 'custom'])
  mode!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitAllocationDto)
  allocations!: SplitAllocationDto[];
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
      {
        splitMode: dto.splitMode,
        allocations: dto.allocations,
      },
    );
  }

  /**
   * Customer-initiated confirm (Pix manual / mock-pago). Quando integramos
   * PSP de verdade, o webhook precisa de auth propria (API key) — esse
   * endpoint nao serve pra isso. SessionGuard garante que so quem ta na
   * mesa que originou o pagamento pode marcar como pago, e o service
   * valida (a) ownership por table_session_id, (b) expires_at < now —
   * sem isso bug-hunter conseguia confirmar Pix vencido.
   */
  @Post(':paymentId/confirm')
  @UseGuards(SessionGuard)
  async confirmPayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: ConfirmPaymentDto,
    @Session() session: SessionData,
  ) {
    return this.paymentsService.confirmPayment(
      paymentId,
      session.sessionId,
      dto.pspTransactionId,
    );
  }

  /**
   * Customer-initiated cancel of their own pending Pix (S9b ← voltar).
   */
  @Patch(':paymentId/cancel')
  @UseGuards(SessionGuard)
  async cancelPayment(
    @Param('paymentId') paymentId: string,
    @Session() session: SessionData,
  ) {
    return this.paymentsService.cancelPayment(paymentId, session.sessionId);
  }

  /**
   * Server-side split calculation (SP1 helper). Kept separate from
   * requestPayment so the UI can show the breakdown before anyone commits
   * to paying.
   */
  @Post('bill/split/compute')
  @UseGuards(SessionGuard)
  async computeSplit(
    @Body() dto: ComputeSplitDto,
    @Session() session: SessionData,
  ) {
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
  async notifySplit(
    @Body() dto: NotifySplitDto,
    @Session() session: SessionData,
  ) {
    return this.paymentsService.notifySplit(
      session.sessionId,
      dto.mode,
      dto.allocations,
    );
  }

  @Get()
  @UseGuards(SessionGuard)
  async getSessionPayments(@Session() session: SessionData) {
    const payments = await this.paymentsService.getSessionPayments(
      session.sessionId,
    );
    return { payments };
  }

  @Get(':paymentId')
  @UseGuards(SessionGuard)
  async getPaymentStatus(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getPaymentStatus(paymentId);
  }
}
