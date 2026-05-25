import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { QrResolverService } from './qr-resolver.service';

@Controller('qr')
export class QrResolverController {
  constructor(private readonly service: QrResolverService) {}

  @Get(':token')
  async resolve(@Param('token') token: string, @Res() res: Response) {
    const result = await this.service.resolvePublicToken(token);
    return res.redirect(302, result.redirectUrl);
  }
}
