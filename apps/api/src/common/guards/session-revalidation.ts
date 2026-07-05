import { HttpException, HttpStatus } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { SessionData, SessionRequest } from './session.guard';

/**
 * A04 (Insecure Design) + multi-tenant fix — re-scan OWASP 2026-07-05.
 *
 * O token de sessão do cliente é `table_sessions.id` guardado no Redis
 * (`session:<id>`, TTL 4h). Os guards antes só checavam EXISTÊNCIA da chave.
 * Dois furos:
 *
 *  1. A04: ao FECHAR/LIBERAR a mesa, a chave Redis não era apagada e o guard
 *     nunca olhava `status`/`closed_at` — um cliente com o cookie ainda no TTL
 *     criava orders/payments numa conta JÁ liquidada (dívida-fantasma +
 *     pagamento em mesa encerrada). O close agora DELETA a chave (invalidação
 *     imediata, host.service.liberateTable + ttl-tick.sweepStaleSessions), mas
 *     essa revalidação é a rede defense-in-depth: qualquer caminho que feche a
 *     sessão no Postgres SEM apagar a chave (sweep concorrente, close manual no
 *     banco, chave re-emitida por refresh de TTL) é pego aqui.
 *
 *  2. Multi-tenant: o guard não cruzava o tenant do token (`schemaName`,
 *     carimbado na criação da sessão) com o tenant da URL (`tenantSchemaName`,
 *     resolvido pelo TenantMiddleware a partir do slug). Um token do tenant A
 *     era aceito numa rota `/{slugB}/...` — partia a escrita entre escopos.
 *
 * Custo: 1 SELECT leve (PK lookup em `table_sessions`, índice de status já
 * existe) por request autenticado. Usa o schema JÁ VALIDADO do token — que
 * este helper confirma ser idêntico ao schema da URL antes de tocar o banco —
 * então a interpolação de `schemaName` é segura (mesmo regex do
 * TenantMiddleware / EventsGateway).
 */
const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]{0,62}$/;

export async function revalidateSessionOrThrow(
  dataSource: DataSource,
  parsed: SessionData,
  request: SessionRequest,
): Promise<void> {
  const urlSchema = request.tenantSchemaName;

  // 1. Cross-check de tenant: o schema carimbado no token TEM que bater com o
  //    schema resolvido da URL. Divergência = token de outro tenant reusado
  //    numa rota alheia → 401. (Quando a rota não resolve tenant — ex.: `qr`
  //    ou middleware não rodou — `urlSchema` é undefined; nesse caso não há
  //    com o que cruzar e seguimos só com a checagem de status abaixo.)
  if (urlSchema && parsed.schemaName !== urlSchema) {
    throw new HttpException(
      'Sessao nao pertence a este restaurante. Escaneie o QR Code novamente.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  const schemaName = parsed.schemaName;
  if (!schemaName || !SCHEMA_NAME_RE.test(schemaName)) {
    // Payload sem schema válido — trata como sessão inválida (fail-closed).
    throw new HttpException(
      'Sessao invalida. Escaneie o QR Code novamente.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  // 2. Revalida que a sessão continua ATIVA no Postgres. Sessão fechada/
  //    liberada (status != 'active' OU closed_at preenchido) é rejeitada
  //    mesmo que a chave Redis ainda esteja viva.
  const rows = (await dataSource.query(
    `SELECT status, closed_at FROM "${schemaName}".table_sessions WHERE id = $1 LIMIT 1`,
    [parsed.sessionId],
  )) as Array<{ status: string; closed_at: string | Date | null }>;

  const row = rows[0];
  if (!row || row.status !== 'active' || row.closed_at !== null) {
    throw new HttpException(
      'Sessao encerrada. Escaneie o QR Code novamente.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
