import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
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

  @IsOptional()
  @IsString()
  accessToken?: string;
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
      dto.accessToken,
    );

    // A07: cookie/header de auth = o TOKEN (HMAC do id), não o id. O
    // `sessionId` volta separado como identificador de recurso (WS room,
    // tableSessionId de merge) — inócuo de expor.
    res.cookie('session_token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 4 * 60 * 60 * 1000,
      path: '/',
    });

    return {
      sessionId: session.sessionId,
      token: session.token,
      tableCode: session.tableCode,
      tableLabel: session.tableLabel,
    };
  }
}
