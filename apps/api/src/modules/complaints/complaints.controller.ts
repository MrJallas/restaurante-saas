import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  constructor(private readonly service: ComplaintsService) {}

  @Post()
  @UseGuards(SessionGuard)
  async create(@Param('slug') slug: string, @Body() dto: CreateComplaintDto) {
    return this.service.create(
      {
        customerId: dto.customerId,
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

  @Post(':id/respond')
  @UseGuards(StaffOnlyGuard, ManagerOnlyGuard)
  async respond(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: RespondDto,
  ) {
    return this.service.respond(id, { staffId: dto.staffId }, dto, slug);
  }

  @Post(':id/resolve')
  @UseGuards(StaffOnlyGuard)
  async resolve(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: ResolveDto = {},
  ) {
    return this.service.resolve(id, { staffId: dto.staffId }, slug);
  }

  @Post(':id/forward')
  @UseGuards(StaffOnlyGuard)
  async forward(@Param('id') id: string, @Body() dto: ForwardDto) {
    return this.service.forward(id, dto.toStaffId, dto.notes);
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
