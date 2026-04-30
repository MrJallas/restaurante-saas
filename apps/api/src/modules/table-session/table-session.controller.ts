import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { IsString, IsNotEmpty } from 'class-validator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { TableSessionService } from './table-session.service';

class InitSessionDto {
  @IsString()
  @IsNotEmpty()
  tableCode!: string;

  @IsString()
  @IsNotEmpty()
  hmacSignature!: string;

  @IsString()
  @IsNotEmpty()
  timestamp!: string;
}

@Controller(':slug/session')
export class TableSessionController {
  constructor(private readonly tableSessionService: TableSessionService) {}

  @Post('init')
  async initSession(
    @Body() dto: InitSessionDto,
    @Tenant() schemaName: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.tableSessionService.initSession(
      dto.tableCode,
      dto.hmacSignature,
      dto.timestamp,
      schemaName,
    );

    res.cookie('session_token', session.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 4 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      sessionId: session.sessionId,
      tableCode: session.tableCode,
      tableLabel: session.tableLabel,
    };
  }
}
