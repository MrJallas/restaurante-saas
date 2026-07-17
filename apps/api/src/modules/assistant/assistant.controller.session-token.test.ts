import type { Request } from 'express';
import { readSessionAuthToken } from './assistant.controller';

function request(input: Partial<Request>): Request {
  return input as Request;
}

describe('readSessionAuthToken', () => {
  it('prefers the HttpOnly cookie credential', () => {
    expect(
      readSessionAuthToken(
        request({
          cookies: { session_token: ' cookie-hmac ' },
          headers: { 'x-session-token': 'header-hmac' },
        }),
      ),
    ).toBe('cookie-hmac');
  });

  it('accepts the authenticated header without confusing it with sessionId', () => {
    expect(
      readSessionAuthToken(request({ cookies: {}, headers: { 'x-session-token': 'header-hmac' } })),
    ).toBe('header-hmac');
  });

  it('returns null when no bearer credential is present', () => {
    expect(readSessionAuthToken(request({ cookies: {}, headers: {} }))).toBeNull();
  });
});
