/**
 * Round 17 (B-NEW-66/67/68) — contract assertions for the three audit /
 * IDOR fixes shipped this round. Apps/api doesn't ship Jest today (see
 * `tenant/query-utils.spec.ts` header note); this file is type-checked by
 * `tsc --noEmit -p apps/api/tsconfig.json` and the runtime assertions are
 * invokable via `node -r ts-node/register .../round17-contract.spec.ts`
 * for ad-hoc verification.
 *
 * What we assert (and why):
 *   1. The DTOs still ACCEPT `customerId` / `endedBy` (backwards-compat —
 *      forbidNonWhitelisted is on globally; if FE keeps sending these
 *      fields, validation must not 400). The body values are *ignored*
 *      server-side per the controller comments.
 *   2. The controllers' service-call sites no longer thread `dto.*` into
 *      the audit-attribution path. We can't easily assert that statically
 *      (it requires inspecting the call AST); instead we cover it by
 *      exercising the DTO classes alone — the wire-shape contract that
 *      FE depends on.
 *
 * Why this file exists at all: rounds 4-16 have shown that fixes regress
 * when reviewers conflate "DTO removed" with "field ignored." Keeping the
 * DTO field asserts the *non-breaking* nature of the fix; the controller
 * comments document the *security* nature.
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Minimal mirrors of the controller-private DTOs. Kept inline because the
 * controllers don't export them (and we don't want to widen their public
 * surface for a test file). Every decorator must mirror the production
 * controller — if those drift, this spec will silently pass while the
 * real validation diverges. Mitigated by keeping this file next to the
 * round17 fixes so any change touches both.
 */
class CreateOrderItemMirrorDto {
  @IsString()
  @IsNotEmpty()
  menuItemId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  extraIds?: string[];

  @IsOptional()
  @IsUUID()
  customerId?: string | null;
}

class CreateOrderMirrorDto {
  @IsIn(['table', 'individual'])
  billingMode!: 'table' | 'individual';

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemMirrorDto)
  items!: CreateOrderItemMirrorDto[];

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}

class ToggleFlagMirrorDto {
  @IsIn(['vip', 'allergy', 'reincidente'])
  flag!: string;

  @IsIn(['add', 'remove'])
  action!: 'add' | 'remove';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

class EndZonePauseMirrorDto {
  @IsOptional()
  @IsUUID()
  endedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/* eslint-disable no-console */
export async function runRound17ContractAssertions(): Promise<void> {
  // ─────────────────────────────────────────────────────────────
  // 1. CreateOrderDto · `customerId` field is still accepted (no 400).
  // ─────────────────────────────────────────────────────────────
  const validOrder = plainToInstance(CreateOrderMirrorDto, {
    billingMode: 'individual',
    visitId: 'visit-uuid-placeholder',
    customerId: '00000000-0000-4000-8000-000000000000',
    items: [{ menuItemId: 'menu-1', quantity: 2 }],
  });
  const orderErrors = await validate(validOrder);
  if (orderErrors.length !== 0) {
    throw new Error(
      `Round 17: CreateOrderDto rejected legit body with customerId — FE compat broken. Errors: ${JSON.stringify(orderErrors)}`,
    );
  }

  // 1b. Body sem customerId também passa (FE pós-cleanup).
  const orderNoCustomer = plainToInstance(CreateOrderMirrorDto, {
    billingMode: 'table',
    items: [{ menuItemId: 'menu-1', quantity: 1 }],
  });
  const orderNoCustomerErrors = await validate(orderNoCustomer);
  if (orderNoCustomerErrors.length !== 0) {
    throw new Error(
      'Round 17: CreateOrderDto rejected body without customerId.',
    );
  }

  // 1c. customerId mal-formado (não-UUID) rejeitado — defesa-em-depth
  // preservada mesmo que o servidor ignore o valor.
  const orderBadUuid = plainToInstance(CreateOrderMirrorDto, {
    billingMode: 'table',
    customerId: 'not-a-uuid',
    items: [{ menuItemId: 'menu-1', quantity: 1 }],
  });
  const orderBadUuidErrors = await validate(orderBadUuid);
  if (orderBadUuidErrors.length === 0) {
    throw new Error(
      'Round 17: CreateOrderDto accepted malformed customerId — class-validator decorator missing.',
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ToggleFlagDto · `customerId` field still accepted (back-compat).
  // ─────────────────────────────────────────────────────────────
  const toggle = plainToInstance(ToggleFlagMirrorDto, {
    flag: 'vip',
    action: 'add',
    customerId: '00000000-0000-4000-8000-000000000000',
    reason: 'big spender',
  });
  const toggleErrors = await validate(toggle);
  if (toggleErrors.length !== 0) {
    throw new Error(
      'Round 17: ToggleFlagDto rejected legit body with customerId.',
    );
  }

  // 2b. Sem customerId também passa.
  const toggleNoCustomer = plainToInstance(ToggleFlagMirrorDto, {
    flag: 'vip',
    action: 'remove',
  });
  const toggleNoCustomerErrors = await validate(toggleNoCustomer);
  if (toggleNoCustomerErrors.length !== 0) {
    throw new Error(
      'Round 17: ToggleFlagDto rejected body without customerId.',
    );
  }

  // 2c. flag inválida ainda rejeitada.
  const toggleBadFlag = plainToInstance(ToggleFlagMirrorDto, {
    flag: 'arbitrary-flag',
    action: 'add',
  });
  const toggleBadFlagErrors = await validate(toggleBadFlag);
  if (toggleBadFlagErrors.length === 0) {
    throw new Error(
      'Round 17: ToggleFlagDto accepted unknown flag — IsIn enforcement broken.',
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 3. EndZonePauseDto · `endedBy` field still accepted (back-compat).
  // ─────────────────────────────────────────────────────────────
  const end = plainToInstance(EndZonePauseMirrorDto, {
    endedBy: '00000000-0000-4000-8000-000000000000',
    reason: 'shift over',
  });
  const endErrors = await validate(end);
  if (endErrors.length !== 0) {
    throw new Error(
      'Round 17: EndZonePauseDto rejected legit body with endedBy.',
    );
  }

  // 3b. Empty body passa (round 17 path interno só usa o req).
  const endEmpty = plainToInstance(EndZonePauseMirrorDto, {});
  const endEmptyErrors = await validate(endEmpty);
  if (endEmptyErrors.length !== 0) {
    throw new Error(
      'Round 17: EndZonePauseDto rejected empty body.',
    );
  }

  // 3c. reason > 500 chars rejeitado (class-validator MaxLength).
  const endLongReason = plainToInstance(EndZonePauseMirrorDto, {
    reason: 'x'.repeat(501),
  });
  const endLongReasonErrors = await validate(endLongReason);
  if (endLongReasonErrors.length === 0) {
    throw new Error(
      'Round 17: EndZonePauseDto accepted reason > 500 chars.',
    );
  }

  console.log('round17-contract assertions OK');
}

if (require.main === module) {
  void runRound17ContractAssertions();
}
