import { Controller, Post, Body, Req, Res, UseGuards } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Response } from 'express';
import { SessionGuard } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData } from '../../common/guards/session.guard';
import { CustomersService } from './customers.service';

const RECOGNITION_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

class CustomerWelcomeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @MinLength(11)
  @MaxLength(11)
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf!: string;
}

class CustomerRecognizeDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  recognitionToken?: string;
}

@Controller(':slug/customer')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('welcome')
  @UseGuards(SessionGuard)
  async welcome(
    @Body() dto: CustomerWelcomeDto,
    @Session() session: SessionData,
    @Req() req: { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const callerRecognitionToken = req.cookies?.recognition_token ?? null;
    const result = await this.customersService.welcome(
      dto.name,
      dto.cpf,
      session.sessionId,
      callerRecognitionToken,
    );

    res.cookie('recognition_token', result.recognitionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: RECOGNITION_COOKIE_MAX_AGE,
    });

    return {
      customerId: result.customerId,
      name: result.name,
      recognitionToken: result.recognitionToken,
      isReturning: result.isReturning,
      totalVisits: result.totalVisits,
      lastVisitSummary: result.lastVisitSummary,
      visitId: result.visitId,
    };
  }

  @Post('recognize')
  @UseGuards(SessionGuard)
  async recognize(
    @Body() dto: CustomerRecognizeDto,
    @Session() session: SessionData,
    @Req() req: { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      dto.recognitionToken ?? req.cookies?.recognition_token ?? null;
    if (!token) {
      return { recognized: false };
    }

    const result = await this.customersService.recognize(
      token,
      session.sessionId,
    );

    res.cookie('recognition_token', result.recognitionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: RECOGNITION_COOKIE_MAX_AGE,
    });

    return result;
  }
}
