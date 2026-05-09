import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { SessionGuard } from '../../common/guards/session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { ComplaintsService } from './complaints.service';

class CreateComplaintDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  orderRatingId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /**
   * Per docs/features/complaint-flow-v12.md: composer chips classify the
   * problem in one of 5 buckets so the manager can see at a glance.
   * Optional because legacy clients don't send it; new composer enforces it.
   */
  @IsOptional()
  @IsIn(['demora', 'item-errado', 'item-faltando', 'comida-fria', 'outro'])
  problemType?: string;

  @IsString()
  @MaxLength(2000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachedImageUrl?: string;
}

class RespondDto {
  @IsString()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsIn(['on-the-way', 'kitchen-check', 'courtesy', 'custom'])
  chipAction?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}

class ResolveDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;
}

class ForwardDto {
  @IsUUID()
  toStaffId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class ListQueryDto {
  @IsOptional()
  @IsIn(['pending_review', 'in_progress', 'responded', 'closed'])
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedManagerId?: string;
}

@Controller(':slug/complaints')
export class ComplaintsController {
  constructor(
    private readonly service: ComplaintsService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 8 (B-NEW-27): customerId derivado do cookie em vez de aceitar
   * via body. Antes: customer A passava `customerId: <vítima>` e
   * complaint era criado em nome dela — manager via complaint atribuído
   * a B falsamente, audit log mostrava B reclamando, reputação dela
   * impactada se manager bloqueia/marca como reincidente.
   */
  @Post()
  @UseGuards(SessionGuard)
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateComplaintDto,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.requireCustomerId(req);
    return this.service.create(
      {
        customerId: callerCustomerId,
        visitId: dto.visitId,
        orderId: dto.orderId,
        orderRatingId: dto.orderRatingId,
        rating: dto.rating,
        problemType: dto.problemType,
        text: dto.text,
        attachedImageUrl: dto.attachedImageUrl,
      },
      slug,
    );
  }

  /**
   * Round 10 (B-NEW-49): staffId derivado do `x-staff-id` header em vez
   * de aceitar via body. ManagerOnlyGuard já valida role+DB; aqui só
   * extraímos o ID confiável. Antes: dto.staffId arbitrário gravava
   * audit como qualquer staff (audit log spoof).
   */
  @Post(':id/respond')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async respond(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RespondDto,
    @Req() req: Request,
  ) {
    const staffId = this.callerResolver.requireStaffId(req);
    return this.service.respond(id, { staffId }, dto, slug);
  }

  /**
   * Round 12 (B-NEW-60): trocado requireStaffId por requireActiveStaffId
   * (cross-check em DB que staff existe + is_active=true). StaffOnlyGuard
   * só valida x-staff-key (env), não o x-staff-id — antes audit gravava
   * UUID arbitrário se atacante tinha a key.
   */
  @Post(':id/resolve')
  @UseGuards(StaffOnlyGuard)
  async resolve(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() _dto: ResolveDto = {},
    @Req() req: Request,
  ) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.service.resolve(id, { staffId }, slug);
  }

  /**
   * Round 13 (B-NEW-66): adicionado ManagerOnlyGuard + requireActiveStaffId
   * pra alinhar com respond/resolve. Antes qualquer staff com x-staff-key
   * reassinava complaint pra qualquer manager (audit-light, mas
   * inconsistente com os irmãos do mesmo controller).
   */
  @Post(':id/forward')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async forward(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: ForwardDto,
    @Req() req: Request,
  ) {
    await this.callerResolver.requireActiveStaffId(req);
    return this.service.forward(id, dto.toStaffId, dto.notes, slug);
  }

  @Get()
  @UseGuards(StaffOnlyGuard)
  async list(@Query() q: ListQueryDto) {
    return this.service.list({
      status: q.status,
      assignedManagerId: q.assignedManagerId,
    });
  }
}
