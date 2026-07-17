import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, type WebSocketAdapter } from '@nestjs/common';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { createRequestTimingMiddleware } from './common/performance/request-timing';
import { createSecurityHeadersMiddleware } from './common/security/security-headers';
import { UserMessageExceptionFilter } from './common/filters/user-message-exception.filter';
import { assertStaffKeyConfigured } from './common/config/assert-staff-key';
import { assertSessionSecretConfigured } from './common/auth/session-auth-token';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  assertStaffKeyConfigured(logger);
  assertSessionSecretConfigured(logger);
  // Em workspaces npm, @nestjs/core pode ser hoisted na raiz enquanto o
  // adapter fica em apps/api/node_modules. O auto-loader do Nest resolve o
  // require a partir de @nestjs/core e não enxerga o pacote irmão; passar o
  // adapter explicitamente mantém o boot determinístico no Docker e local.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter());
  // O mesmo layout hoisted afeta o auto-loader do adapter WebSocket. Sem o
  // registro explícito, o HTTP sobe saudável, mas `/socket.io/` cai no 404 do
  // Express e todo realtime do salão fica silenciosamente desconectado.
  // Nest 11.1.28 expõe `WsMessageHandler` em @nestjs/common sem o campo
  // interno `methodName` que o IoAdapter oficial recebe; o cast atravessa
  // apenas essa divergência de declarations entre dois pacotes da mesma
  // versão. O objeto em runtime é o adapter oficial do Nest.
  app.useWebSocketAdapter(new IoAdapter(app) as unknown as WebSocketAdapter);

  // Nest 11 usa Express 5, cujo parser de query default passou de `extended`
  // para `simple`. Preserva o contrato anterior para filtros/arrays existentes.
  app.set('query parser', 'extended');

  app.use(createRequestTimingMiddleware());

  // A05: headers de segurança em toda resposta (JSON-only → default-src 'none').
  app.use(createSecurityHeadersMiddleware());

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
