import * as React from 'react';
import { TextDecoder, TextEncoder } from 'util';
import { ScreenHostLateArrival } from './ScreenHostLateArrival';

Object.assign(globalThis, { TextDecoder, TextEncoder });

describe('ScreenHostLateArrival — fronteira customer-host/staff', () => {
  it('apresenta awareness passivo sem CTAs staff que o backend não autoriza', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(
      <ScreenHostLateArrival tenantSlug="restaurant_dev" requestId="request-1" />,
    );

    expect(html).toContain('Apenas acompanhamento');
    expect(html).toContain('Voltar ao salão');
    expect(html).not.toContain('Aprovar entrada');
    expect(html).not.toContain('Rejeitar');
  });
});
