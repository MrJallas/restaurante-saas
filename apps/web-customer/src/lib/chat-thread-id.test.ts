import { normalizeChatThreadIdParam } from './chat-thread-id';

describe('normalizeChatThreadIdParam', () => {
  const threadId = 'restaurant_dev:customer-id:conversation-id';

  it('keeps a raw colon-separated thread id stable', () => {
    expect(normalizeChatThreadIdParam(threadId)).toBe(threadId);
  });

  it('decodes the route param once after a hard reload and permits one API encoding', () => {
    const fromNextParams = encodeURIComponent(threadId);
    const normalized = normalizeChatThreadIdParam(fromNextParams);

    expect(normalized).toBe(threadId);
    expect(encodeURIComponent(normalized)).toBe(fromNextParams);
    expect(encodeURIComponent(normalized)).not.toContain('%253A');
  });

  it('does not crash the route on a malformed percent sequence', () => {
    expect(normalizeChatThreadIdParam('tenant%ZZcustomer')).toBe('tenant%ZZcustomer');
  });
});
