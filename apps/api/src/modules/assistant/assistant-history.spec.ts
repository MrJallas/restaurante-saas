/**
 * Executable assertions for GET /assistant/history public history shape.
 *
 * apps/api still uses lightweight spec files that are type-checked by the
 * build and can be run directly with ts-node:
 *   TS_NODE_PROJECT=apps/api/tsconfig.json node -r ts-node/register apps/api/src/modules/assistant/assistant-history.spec.ts
 */

import 'reflect-metadata';
import { AssistantService } from './assistant.service';

/* eslint-disable no-console */
export async function runAssistantHistoryAssertions(): Promise<void> {
  const tableSessionId = '22222222-2222-2222-2222-222222222222';
  const customerId = '33333333-3333-3333-3333-333333333333';
  const staffId = '11111111-1111-1111-1111-111111111111';
  let capturedSql = '';
  let capturedParams: unknown[] = [];

  const tenantConn = {
    async query(sql: string, params: unknown[]) {
      capturedSql = sql;
      capturedParams = params;
      return [
        {
          id: '44444444-4444-4444-4444-444444444444',
          user_message: '',
          assistant_response: 'A sobremesa chega em 5 minutos.',
          tool_calls: null,
          from_role: 'staff',
          customer_id: null,
          model_used: staffId,
          created_at: '2026-05-27T10:00:00.000Z',
          staff_name: 'Renata Silva',
          staff_role: 'manager',
        },
        {
          id: '55555555-5555-5555-5555-555555555555',
          user_message: 'Quero uma sobremesa.',
          assistant_response: 'Claro, vou te mostrar as opcoes.',
          tool_calls: [{ name: 'view_menu' }],
          from_role: null,
          customer_id: customerId,
          model_used: null,
          created_at: '2026-05-27T10:01:00.000Z',
          staff_name: null,
          staff_role: null,
        },
      ];
    },
  };

  const service = new AssistantService(
    tenantConn as unknown as import('../tenant/tenant-connection.provider').TenantConnectionProvider,
    {} as unknown as import('../../infra/ai/ai-service.client').AiServiceClient,
    {} as unknown as import('../../infra/redis/redis.service').RedisService,
  );

  const history = await service.getHistoryWithToolCalls(
    tableSessionId,
    customerId,
  );

  if (capturedParams[0] !== tableSessionId || capturedParams[1] !== customerId) {
    throw new Error(
      `assistant history params mismatch: ${JSON.stringify(capturedParams)}`,
    );
  }
  if (!capturedSql.includes('LEFT JOIN staff')) {
    throw new Error('assistant history no longer resolves staff metadata.');
  }
  if (!capturedSql.includes('session_participants')) {
    throw new Error('assistant history no longer gates staff rows by approved participants.');
  }
  if (!capturedSql.includes("am.model_used ~* '^[0-9a-f]")) {
    throw new Error('assistant history must regex-check model_used before UUID cast.');
  }

  const staffMessage = history.find((m) => m.role === 'staff');
  if (!staffMessage) {
    throw new Error('assistant history did not return role=staff.');
  }
  if (staffMessage.content !== 'A sobremesa chega em 5 minutos.') {
    throw new Error(`unexpected staff content: ${staffMessage.content}`);
  }
  if (staffMessage.staffId !== staffId) {
    throw new Error(`staffId was not preserved: ${staffMessage.staffId}`);
  }
  if (staffMessage.staffName !== 'Renata Silva') {
    throw new Error(`staffName was not resolved: ${staffMessage.staffName}`);
  }
  if (staffMessage.staffRole !== 'Gerente') {
    throw new Error(`staffRole label was not resolved: ${staffMessage.staffRole}`);
  }

  const emptyUser = history.find(
    (m) => m.role === 'user' && m.content.trim().length === 0,
  );
  if (emptyUser) {
    throw new Error('assistant history emitted an empty user bubble.');
  }

  const roles = history.map((m) => m.role).join(',');
  if (roles !== 'staff,user,assistant') {
    throw new Error(`assistant history order/roles mismatch: ${roles}`);
  }

  console.log('assistant history assertions OK');
}

if (require.main === module) {
  runAssistantHistoryAssertions().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
