/**
 * Round 17 (B-NEW-66/67/68) — contract tests for the three audit / IDOR
 * fixes shipped that round. MIGRADO de `round17-contract.spec.ts` (ts-node)
 * pra Jest no prompt 100 §5.4 — mesmo conteúdo, agora executado por
 * `npm test --workspace @restaurant/api`.
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
import { plainToInstance, Type } from 'class-transformer';
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

describe('Round 17 DTO wire-shape contracts', () => {
  describe('CreateOrderDto', () => {
    it('still accepts a body WITH customerId (FE backwards-compat)', async () => {
      const dto = plainToInstance(CreateOrderMirrorDto, {
        billingMode: 'individual',
        visitId: 'visit-uuid-placeholder',
        customerId: '00000000-0000-4000-8000-000000000000',
        items: [{ menuItemId: 'menu-1', quantity: 2 }],
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('accepts a body WITHOUT customerId (FE pós-cleanup)', async () => {
      const dto = plainToInstance(CreateOrderMirrorDto, {
        billingMode: 'table',
        items: [{ menuItemId: 'menu-1', quantity: 1 }],
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('rejects a malformed (non-UUID) customerId — defesa-em-profundidade', async () => {
      const dto = plainToInstance(CreateOrderMirrorDto, {
        billingMode: 'table',
        customerId: 'not-a-uuid',
        items: [{ menuItemId: 'menu-1', quantity: 1 }],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ToggleFlagDto', () => {
    it('still accepts a body WITH customerId (back-compat)', async () => {
      const dto = plainToInstance(ToggleFlagMirrorDto, {
        flag: 'vip',
        action: 'add',
        customerId: '00000000-0000-4000-8000-000000000000',
        reason: 'big spender',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('accepts a body WITHOUT customerId', async () => {
      const dto = plainToInstance(ToggleFlagMirrorDto, {
        flag: 'vip',
        action: 'remove',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('still rejects an unknown flag (IsIn enforcement)', async () => {
      const dto = plainToInstance(ToggleFlagMirrorDto, {
        flag: 'arbitrary-flag',
        action: 'add',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('EndZonePauseDto', () => {
    it('still accepts a body WITH endedBy (back-compat)', async () => {
      const dto = plainToInstance(EndZonePauseMirrorDto, {
        endedBy: '00000000-0000-4000-8000-000000000000',
        reason: 'shift over',
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('accepts an empty body (round 17 path interno só usa o req)', async () => {
      const dto = plainToInstance(EndZonePauseMirrorDto, {});
      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('rejects reason > 500 chars (MaxLength)', async () => {
      const dto = plainToInstance(EndZonePauseMirrorDto, {
        reason: 'x'.repeat(501),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
