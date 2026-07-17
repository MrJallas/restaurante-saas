import { Controller, Post, Get, Body, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
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
import { SessionGuard, SessionData } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { FeedbacksService } from './feedbacks.service';

class SubmitFeedbackDto {
  /**
   * Round 5 (P1-X7-2): obrigatório. feedbacks.visit_id é NOT NULL no DB —
   * antes `visitId` opcional virava null e estourava 23502 → 500. Agora o
   * DTO rejeita ausência com 400 e o service valida ownership da visit.
   */
  @IsUUID()
  @IsNotEmpty()
  visitId!: string;

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
  constructor(
    private readonly feedbacksService: FeedbacksService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 8 (B-NEW-27): customerId derivado do cookie (opt-in — feedback
   * pode ser anônimo). Antes customer A passava `customerId: <vítima>`
   * e o feedback ficava em nome dela no audit.
   */
  @Post()
  @UseGuards(SessionGuard)
  async submitFeedback(
    @Body() dto: SubmitFeedbackDto,
    @Req() req: Request,
    @Session() session: SessionData,
  ) {
    const callerCustomerId = await this.callerResolver.tryGetCustomerId(req);
    return this.feedbacksService.submitFeedback(
      {
        visitId: dto.visitId,
        customerId: callerCustomerId,
        overallRating: dto.overallRating,
        foodRating: dto.foodRating,
        serviceRating: dto.serviceRating,
        ambienceRating: dto.ambienceRating,
        comment: dto.comment,
        tags: dto.tags,
      },
      session.sessionId,
    );
  }

  @Get()
  @UseGuards(SessionGuard)
  async getFeedback(
    @Query('visitId') visitId: string,
    @Session() session: SessionData,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.tryGetCustomerId(req);
    return this.feedbacksService.getFeedbackByVisit(visitId, session.sessionId, callerCustomerId);
  }
}
