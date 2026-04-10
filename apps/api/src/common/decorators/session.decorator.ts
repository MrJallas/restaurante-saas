import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SessionData, SessionRequest } from '../guards/session.guard';

export const Session = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionData => {
    const request = ctx.switchToHttp().getRequest<SessionRequest>();
    return request.sessionData!;
  },
);
