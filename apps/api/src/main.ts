import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { createRequestTimingMiddleware } from './common/performance/request-timing';
import { UserMessageExceptionFilter } from './common/filters/user-message-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.use(createRequestTimingMiddleware());

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3003',
      'http://localhost:3002',
    ],
    credentials: true,
    maxAge: 600,
  });

  // Sem isso, SessionGuard.canActivate le `request.cookies?.session_token`
  // sempre como undefined — o cookie chega no header mas nao e parseado.
  // Em browsers que bloqueiam header customizados ou cenarios cross-origin
  // onde o frontend nao seta `x-session-token`, todas as rotas protegidas
  // viravam 401. Foi P0 confirmado pelo bug-hunt.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new UserMessageExceptionFilter());

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`API rodando em http://localhost:${port}`);
}

bootstrap();
