import { Injectable, Logger } from '@nestjs/common';
import type { Db } from 'mongodb';
import type { TimelineEntry } from '@restaurant/shared-types';
import { MongoService } from '../../infra/mongo/mongo.service';

const TIMELINE_COLLECTION = 'session_timeline';

/** Doc persistido = TimelineEntry + tenant dono (slug). */
export type TimelineDoc = TimelineEntry & { tenantId: string };

/**
 * M4 (timeline) — event-store Mongo `session_timeline`, alimentado pelo tap
 * do EventsEmitterService (live) e, no futuro, por backfill dos mappers SQL
 * do M1 (os ids convergem — ver regras no TimelineTapService).
 *
 * Decisões:
 *  - Upsert por `id` com $setOnInsert: os ids são derivados da fonte
 *    (fonte:pk, idempotentes — M1), então retry/duplo-emit colapsa no MESMO
 *    doc e o original vence. O índice ÚNICO { id: 1 } garante isso mesmo em
 *    upserts concorrentes.
 *  - ensureIndexes lazy no 1º write (lição do commit 8c7f222: ensureIndexes
 *    que ninguém chama é placebo): chamado DENTRO de record(), idempotente
 *    (flag só liga com sucesso), e a falha dele não segura o write.
 *  - SEM TTL — sessões antigas continuam visíveis (decisão de produto).
 *    LGPD fica no TAP: só campos estruturados entram no payload da entry.
 *  - FAIL-OPEN TOTAL: Mongo off (tryDb null) ou erro → logger.warn e
 *    retorna. record() NUNCA propaga — o tap roda no caminho do pedido.
 */
@Injectable()
export class TimelineStoreService {
  private readonly logger = new Logger(TimelineStoreService.name);
  private indexesEnsured = false;

  constructor(private readonly mongo: MongoService) {}

  /**
   * Grava uma entry (fire-and-forget do lado do chamador — o tap NÃO
   * aguarda). Sempre resolve; nunca rejeita.
   */
  async record(entry: TimelineEntry, tenantId: string): Promise<void> {
    const db = this.mongo.tryDb();
    if (!db) {
      this.logger.warn(`Mongo off · timeline entry ${entry.id} descartada (fail-open)`);
      return;
    }

    await this.ensureIndexes(db);

    try {
      const doc: TimelineDoc = { ...entry, tenantId };
      await db
        .collection<TimelineDoc>(TIMELINE_COLLECTION)
        .updateOne({ id: entry.id }, { $setOnInsert: doc }, { upsert: true });
    } catch (err) {
      // Inclui o E11000 da corrida upsert-vs-unique — significa que o doc já
      // existe (idempotência venceu), e qualquer outro erro é fail-open.
      this.logger.warn(`Falha ao gravar timeline entry ${entry.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Índices (lazy, no write):
   *  - { id: 1 } ÚNICO — pk lógico idempotente (fonte:pk do M1);
   *  - { tenantId, sessionId, at } — leitura da timeline de uma sessão em
   *    ordem cronológica;
   *  - { tenantId, at: -1 } — feed reverso "o que aconteceu no restaurante".
   * Falha aqui NÃO bloqueia o write; a flag só liga com sucesso, então o
   * próximo record() tenta de novo.
   */
  private async ensureIndexes(db: Db): Promise<void> {
    if (this.indexesEnsured) return;
    try {
      const col = db.collection<TimelineDoc>(TIMELINE_COLLECTION);
      await col.createIndex({ id: 1 }, { unique: true });
      await col.createIndex({ tenantId: 1, sessionId: 1, at: 1 });
      await col.createIndex({ tenantId: 1, at: -1 });
      this.indexesEnsured = true;
    } catch (err) {
      this.logger.warn(
        `Falha ao garantir índices da ${TIMELINE_COLLECTION}: ${(err as Error).message}`,
      );
    }
  }
}
