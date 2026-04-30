import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class StaffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
    }>();

    const provided = request.headers['x-staff-key'];
    const expected = process.env.STAFF_API_KEY;

    if (!expected || !provided) {
      throw new HttpException(
        'Acesso restrito a staff. Informe x-staff-key.',
        HttpStatus.FORBIDDEN,
      );
    }

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpException(
        'Acesso restrito a staff. Informe x-staff-key.',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
