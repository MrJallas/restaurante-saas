import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { FeedbacksService } from './feedbacks.service';

class SubmitFeedbackDto {
  /**
   * Optional — anonymous feedback is allowed (e.g. the user skipped the
   * CPF welcome). When present, the feedback is attached to the visit so
   * staff dashboards can surface trends per customer.
   */
  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  overallRating!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  foodRating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  serviceRating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ambienceRating?: number;

  // Cap em 1000 chars: bug-hunter mostrou que comentario de 99KB
  // passava (so o body limit do Express ~100KB era barreira) e ia
  // pro DB sem truncamento.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  /**
   * Multi-choice categories from S10 ("Comida", "Atendimento", etc). Stored
   * in feedbacks.tags TEXT[] via migration 016.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  @MaxLength(40, { each: true })
  tags?: string[];
}

@Controller(':slug/feedbacks')
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Post()
  @UseGuards(SessionGuard)
  async submitFeedback(@Body() dto: SubmitFeedbackDto) {
    return this.feedbacksService.submitFeedback({
      visitId: dto.visitId ?? null,
      customerId: dto.customerId ?? null,
      overallRating: dto.overallRating,
      foodRating: dto.foodRating,
      serviceRating: dto.serviceRating,
      ambienceRating: dto.ambienceRating,
      comment: dto.comment,
      tags: dto.tags,
    });
  }

  @Get()
  @UseGuards(SessionGuard)
  async getFeedback(@Query('visitId') visitId: string) {
    return this.feedbacksService.getFeedbackByVisit(visitId);
  }
}
