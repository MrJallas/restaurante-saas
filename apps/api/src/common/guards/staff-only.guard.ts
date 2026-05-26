import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { authErrorResponse } from './auth-error-response';

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
        authErrorResponse('AUTH_MISSING', 'Sessão de equipe inválida. Faça login novamente.'),
        HttpStatus.FORBIDDEN,
      );
    }

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpException(
        authErrorResponse('AUTH_INVALID', 'Sessão de equipe inválida. Faça login novamente.'),
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
