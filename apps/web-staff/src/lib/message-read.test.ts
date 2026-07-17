import type { StaffMessageDto } from '@restaurant/shared-types';
import { unreadIncomingMessageIds } from './message-read';

function message(overrides: Partial<StaffMessageDto>): StaffMessageDto {
  return {
    id: 'm1',
    threadId: 't1',
    fromRole: 'staff',
    staffId: 'other',
    staffName: 'Outra pessoa',
    kind: 'direct_reply',
    content: 'Oi',
    metadata: {},
    createdAt: '2026-07-11T00:00:00.000Z',
    readAt: null,
    ...overrides,
  };
}

describe('unreadIncomingMessageIds', () => {
  it('marca somente mensagens recebidas ainda nao lidas', () => {
    expect(
      unreadIncomingMessageIds(
        [
          message({ id: 'incoming' }),
          message({ id: 'mine', staffId: 'me' }),
          message({ id: 'read', readAt: '2026-07-11T00:01:00.000Z' }),
        ],
        'me',
      ),
    ).toEqual(['incoming']);
  });

  it('nao tenta marcar sem identidade valida', () => {
    expect(unreadIncomingMessageIds([message({})], '')).toEqual([]);
  });
});
