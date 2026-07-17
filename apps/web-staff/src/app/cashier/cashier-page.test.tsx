import type { ReactElement } from 'react';
import { TextDecoder, TextEncoder } from 'util';
import CashierPage from './page';
import { CashierAccessGate, CashierUnavailablePanel } from './CashierAccessGate';

Object.assign(globalThis, { TextDecoder, TextEncoder });

describe('/cashier', () => {
  it('monta o client guard exclusivo do caixa', () => {
    const element = CashierPage() as ReactElement;

    expect(element.type).toBe(CashierAccessGate);
  });

  it('explica a indisponibilidade sem inventar dados ou operações financeiras', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(
      <CashierUnavailablePanel
        staffName="Caio"
        switchingProfile={false}
        onSwitchProfile={() => undefined}
      />,
    );

    expect(html).toContain('Caixa ainda não ativado');
    expect(html).toContain('liquidação de caixa ainda não está ativada');
    expect(html).toContain('Pix do fluxo do cliente continua sendo apenas uma demonstração');
    expect(html).toContain('Sair e trocar de perfil');
    expect(html).not.toMatch(/R\$\s*\d/);
    expect(html).not.toMatch(/receita hoje|abrir caixa|fechar caixa|receber pagamento/i);
    expect(html).not.toMatch(/cartão|PSP/i);
  });
});
