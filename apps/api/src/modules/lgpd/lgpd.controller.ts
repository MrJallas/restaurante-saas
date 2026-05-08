import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { LgpdService } from './lgpd.service';

class CreateLgpdDto {
  @IsIn(['erasure', 'export'])
  kind!: 'erasure' | 'export';

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Matches(/^\d{11}$/)
  customerCpf?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class ListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'in_progress', 'fulfilled', 'rejected'])
  status?: string;

  @IsOptional()
  @IsIn(['erasure', 'export'])
  kind?: string;
}

@Controller(':slug/lgpd-requests')
export class LgpdController {
  constructor(private readonly service: LgpdService) {}

  /**
   * `POST /lgpd-requests` · customer creates an erasure (or future export)
   * request. Synchronous fulfillment for erasure; protocol returned right
   * away for the customer to keep.
   */
  @Post()
  @UseGuards(SessionGuard)
  async create(@Body() dto: CreateLgpdDto) {
    return this.service.createRequest({
      kind: dto.kind,
      customerId: dto.customerId ?? null,
      customerCpf: dto.customerCpf ?? null,
      customerEmail: dto.customerEmail ?? null,
      notes: dto.notes,
    });
  }

  /** `GET /lgpd-requests` · manager view. */
  @Get()
  @UseGuards(StaffOnlyGuard)
  async list(@Query() q: ListQueryDto) {
    return this.service.list({ status: q.status, kind: q.kind });
  }
}
