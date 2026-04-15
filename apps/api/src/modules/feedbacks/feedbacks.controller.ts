import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { FeedbacksService } from './feedbacks.service';

class SubmitFeedbackDto {
  @IsString()
  @IsNotEmpty()
  visitId!: string;

  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
  comment?: string;
}

@Controller(':slug/feedbacks')
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Post()
  @UseGuards(SessionGuard)
  async submitFeedback(@Body() dto: SubmitFeedbackDto) {
    return this.feedbacksService.submitFeedback(
      dto.visitId,
      dto.customerId || null,
      dto.overallRating,
      dto.foodRating,
      dto.serviceRating,
      dto.ambienceRating,
      dto.comment,
    );
  }

  @Get()
  @UseGuards(SessionGuard)
  async getFeedback(@Query('visitId') visitId: string) {
    return this.feedbacksService.getFeedbackByVisit(visitId);
  }
}
