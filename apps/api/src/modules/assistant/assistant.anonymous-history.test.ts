import { AssistantService } from './assistant.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { AiServiceClient } from '../../infra/ai/ai-service.client';
import type { RedisService } from '../../infra/redis/redis.service';

describe('AssistantService — histórico sem identidade individual', () => {
  it('não consulta nem devolve histórico interno para caller anônimo da mesa', async () => {
    const query = jest.fn(async () => {
      throw new Error('histórico compartilhado não deveria ser consultado');
    });
    const service = new AssistantService(
      { query } as unknown as TenantConnectionProvider,
      {} as AiServiceClient,
      {} as RedisService,
    );

    await expect(service.getHistory('table-session', null)).resolves.toEqual([]);
    await expect(service.getHistoryWithToolCalls('table-session', null)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
