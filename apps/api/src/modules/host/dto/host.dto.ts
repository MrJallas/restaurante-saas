import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// ─── Liberate ───

export class LiberateTableDto {
  @IsOptional()
  @IsIn(['auto', 'manual_paid', 'manual_force'])
  mode: 'auto' | 'manual_paid' | 'manual_force' = 'auto';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  /**
   * Bug 1: tamanho do próximo grupo escolhido no stepper "QUANTAS PESSOAS?"
   * do ScreenHostTableLiberate. Chega do FE e é usado pelo service (não é
   * mais descartado no client).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  partySize?: number;
}

// ─── Swap ───

export class CreateSwapDto {
  @IsInt()
  @Min(1)
  fromTable!: number;

  @IsInt()
  @Min(1)
  toTable!: number;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}

export class UpdateSwapDto {
  @IsIn(['in_progress', 'completed', 'cancelled'])
  status!: 'in_progress' | 'completed' | 'cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}

// ─── VIP ───

export class ToggleVipDto {
  @IsBoolean()
  flag!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}

// ─── Active table session metadata ───

export class UpdateTableSessionMetaDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  party?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  note?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}

// ─── Waitlist ───

export class CreateWaitlistDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsInt()
  @Min(1)
  party!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ─── Reservations ───

export class CreateReservationDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsInt()
  @Min(1)
  party!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  /**
   * Aceita "HH:MM" (interpretado como hoje as HH:MM) ou ISO 8601 completo.
   * Service normaliza pra TIMESTAMPTZ.
   */
  @IsString()
  @Matches(/^(\d{2}:\d{2}|\d{4}-\d{2}-\d{2}T.+)$/, {
    message: 'when deve ser HH:MM ou ISO 8601',
  })
  when!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  table?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}

export class UpdateReservationDto {
  @IsOptional()
  @IsIn(['arrived', 'cancelled', 'no_show'])
  status?: 'arrived' | 'cancelled' | 'no_show';

  @IsOptional()
  @IsInt()
  @Min(1)
  table?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
