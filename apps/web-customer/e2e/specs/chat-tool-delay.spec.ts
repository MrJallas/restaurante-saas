import { test, expect, Page, Route } from '@playwright/test';
import { newSession } from '../helpers/session';
import { resetWelcomeRateLimitAndSessions } from '../helpers/test-state';

/**
 * Round C/D — chat UX polish.
 *
 * §C "Eyebrow em TODAS as tools" · decisão V20: o eyebrow `··· USANDO X ···`
 * aparece pra qualquer tool dispatchada (silent-path, card visual e text-only).
 * Transparência > minimalismo — user quer saber o que a IA fez. Pra text-only
 * tools (ask_about_restaurant, search_dish, etc.), o `dispatchToolCall` skipa
 * o stub bubble "OK" extra, mas o eyebrow continua marcado no aiMsg principal.
 *
 * §D "Tool delay 1.5s" · entre o `setMessages` que adiciona o aiMsg (com
 * eyebrow) e o efeito da tool (overlay sobe, route push), esperamos 1.5s.
 * Previne sensação de engasgo — o user vê o IA "trabalhando" antes da
 * UI shift.
 *
 * Estratégia: mockamos `/api/restaurant_dev/assistant/message` via
 * `page.route()` para retornar tool calls determinísticos. Sem isso, o
 * AI service real (call LLM) pode demorar > 15s e tropeçar no timeout
 * do FE (`DEFAULT_TIMEOUT_MS` em `lib/api.ts`). O teste verifica a
 * lógica do dispatchToolCall, não o LLM em si.
 *
 * Acceptance criteria do task brief:
 *  - view_menu → eyebrow aparece, 1.5s depois MenuOverlay sobe
 *  - call_waiter → eyebrow, 1.5s depois CallWaiterSheet
 *  - ask_about_restaurant → eyebrow + bubble texto (sem stub "OK" duplicado)
 *  - add_to_order → eyebrow inline + card visual junto
 */

interface MockToolCall {
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}

interface MockResponseBody {
  response: string;
  wasBlocked: boolean;
  toolCalls?: MockToolCall[];
  linkedItems?: Array<{ id: string; name: string; priceCents: number; imageUrl: string | null }>;
}

let cpfSeed = Math.floor(Date.now() % 100_000);

function cpfDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    sum += Number(input[i]) * (input.length + 1 - i);
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

function nextCpf(): string {
  cpfSeed += 1;
  const base = String(840000000 + cpfSeed).slice(0, 9);
  const d1 = cpfDigit(base);
  const d2 = cpfDigit(`${base}${d1}`);
  return `${base}${d1}${d2}`;
}

async function newChatSession(page: Page): Promise<void> {
  await newSession(page, {
    name: `Caleb Teste ${cpfSeed + 1}`,
    cpf: nextCpf(),
  });
}

async function mockAssistantMessage(page: Page, response: MockResponseBody): Promise<void> {
  await page.route('**/api/*/assistant/message', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

test.describe('Chat tool-call eyebrow + delay (C/D)', () => {
  test.beforeEach(() => {
    resetWelcomeRateLimitAndSessions();
  });

  test('view_menu → eyebrow then ~1.5s before MenuOverlay', async ({ page }) => {
    await newChatSession(page);
    await mockAssistantMessage(page, {
      response: '',
      wasBlocked: false,
      toolCalls: [{ name: 'view_menu', arguments: {} }],
    });
    await page.goto('/restaurant_dev/assistente');
    await page.getByPlaceholder('Pergunte alguma coisa...').fill('abre o cardápio');
    await page.getByPlaceholder('Pergunte alguma coisa...').press('Enter');

    // Eyebrow inline aparece primeiro (testid via ToolCallIndicator).
    await page.waitForSelector('[data-testid="tool-indicator-view_menu"]', {
      timeout: 10_000,
    });
    const eyebrowAt = Date.now();

    // MenuOverlay deve subir ~1.5s depois.
    await page.waitForSelector('[data-testid="menu-overlay"]', {
      timeout: 5_000,
    });
    const overlayAt = Date.now();

    const elapsed = overlayAt - eyebrowAt;
    // Tolerância: 1300ms–2200ms cobre jitter de microtask + scheduling.
    expect(elapsed).toBeGreaterThanOrEqual(1300);
    expect(elapsed).toBeLessThan(2200);
  });

  test('call_waiter → eyebrow then ~1.5s before CallWaiterSheet', async ({ page }) => {
    await newChatSession(page);
    await mockAssistantMessage(page, {
      response: '',
      wasBlocked: false,
      toolCalls: [{ name: 'call_waiter', arguments: {} }],
    });
    await page.goto('/restaurant_dev/assistente');
    await page.getByPlaceholder('Pergunte alguma coisa...').fill('chama o garçom');
    await page.getByPlaceholder('Pergunte alguma coisa...').press('Enter');

    await page.waitForSelector('[data-testid="tool-indicator-call_waiter"]', {
      timeout: 10_000,
    });
    const eyebrowAt = Date.now();

    await page.waitForSelector('[data-testid="call-waiter-sheet"]', {
      timeout: 5_000,
    });
    const sheetAt = Date.now();

    const elapsed = sheetAt - eyebrowAt;
    expect(elapsed).toBeGreaterThanOrEqual(1300);
    expect(elapsed).toBeLessThan(2200);
  });

  test('ask_about_restaurant → eyebrow + text bubble (no duplicate stub)', async ({ page }) => {
    await newChatSession(page);
    await mockAssistantMessage(page, {
      response: 'A gente fecha às 23h durante a semana e à 1h da manhã nos fins de semana.',
      wasBlocked: false,
      toolCalls: [{ name: 'ask_about_restaurant', arguments: {} }],
    });
    await page.goto('/restaurant_dev/assistente');
    await page.getByPlaceholder('Pergunte alguma coisa...').fill('a que horas vocês fecham?');
    await page.getByPlaceholder('Pergunte alguma coisa...').press('Enter');

    // Eyebrow inline + texto da resposta — decisão V20: eyebrow aparece pra
    // TODAS as tools dispatchadas, inclusive text-only. O early-return em
    // `dispatchToolCall` evita o stub bubble "OK" duplicado.
    await page.waitForSelector('[data-testid="tool-indicator-ask_about_restaurant"]', {
      timeout: 5_000,
    });
    await page.waitForSelector('text=/A gente fecha às 23h/', { timeout: 10_000 });

    // Garante que não há stub bubble "OK" duplicado embaixo da resposta principal.
    const okBubbles = await page.getByText(/^OK$/).count();
    expect(okBubbles).toBe(0);
  });

  test('add_to_order → eyebrow inline + linked card visual', async ({ page }) => {
    await newChatSession(page);
    await mockAssistantMessage(page, {
      response: 'Adicionei à sua comanda.',
      wasBlocked: false,
      toolCalls: [{ name: 'add_to_order', arguments: {} }],
      linkedItems: [
        {
          id: 'item-test-1',
          name: 'Coxinha de frango',
          priceCents: 1290,
          imageUrl: null,
        },
      ],
    });
    await page.goto('/restaurant_dev/assistente');
    await page.getByPlaceholder('Pergunte alguma coisa...').fill('quero uma coxinha');
    await page.getByPlaceholder('Pergunte alguma coisa...').press('Enter');

    // Eyebrow do add_to_order aparece (tool NÃO é text-only).
    await page.waitForSelector('[data-testid="tool-indicator-add_to_order"]', {
      timeout: 10_000,
    });
    // Card visual da bubble também presente (linkedItems renderiza inline).
    await expect(page.getByText('Coxinha de frango')).toBeVisible({ timeout: 5_000 });
  });
});
