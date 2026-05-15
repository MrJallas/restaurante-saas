import { expect, test } from '@playwright/test';

const SLUG = 'restaurant_dev';
const SESSION_ID = 'playwright-sheet-drag-session';
const SESSION_BUNDLE = {
  sessionId: SESSION_ID,
  tableCode: 'M01',
  tableLabel: 'Mesa 01',
  slug: SLUG,
  customerId: '4cce052c-aa82-4f55-bb04-7379b8232a97',
  visitId: 'playwright-sheet-drag-visit',
  customerName: 'Caleb',
  isReturning: true,
};

async function seedSession(page: import('@playwright/test').Page) {
  await page.addInitScript(({ sessionId, bundle }) => {
    window.sessionStorage.setItem('session_token', sessionId);
    window.sessionStorage.setItem('session:bundle', JSON.stringify(bundle));
    window.sessionStorage.setItem('session:startedAt', new Date().toISOString());
  }, { sessionId: SESSION_ID, bundle: SESSION_BUNDLE });
}

async function dragByTouch(
  page: import('@playwright/test').Page,
  handleSelector: string,
  distance: number,
) {
  return page.evaluate(async ({ handleSelector, distance }) => {
    const handle = document.querySelector<HTMLElement>(handleSelector);
    if (!handle) throw new Error(`Handle not found: ${handleSelector}`);
    const dialog = handle.closest<HTMLElement>('[role="dialog"]');
    const sheet =
      dialog?.querySelector<HTMLElement>('.absolute.inset-x-0.bottom-0.z-10') ??
      handle.parentElement;
    if (!sheet) throw new Error('Sheet not found');

    const rect = handle.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const asTouchList = (items: unknown[]) => {
      const list = Array.from(items) as unknown[] & { item: (i: number) => unknown | null };
      Object.defineProperty(list, 'item', { value: (i: number) => list[i] ?? null });
      return list;
    };
    const makeTouch = (clientY: number) => ({
      identifier: 77,
      target: handle,
      clientX: x,
      clientY,
      pageX: x + window.scrollX,
      pageY: clientY + window.scrollY,
      screenX: x,
      screenY: clientY,
      radiusX: 2,
      radiusY: 2,
      rotationAngle: 0,
      force: 0.5,
    });
    const fire = (type: string, clientY: number) => {
      const touch = makeTouch(clientY);
      const active = type === 'touchend' || type === 'touchcancel' ? [] : [touch];
      const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(event, 'touches', { value: asTouchList(active) });
      Object.defineProperty(event, 'targetTouches', { value: asTouchList(active) });
      Object.defineProperty(event, 'changedTouches', { value: asTouchList([touch]) });
      handle.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    fire('touchstart', y);
    await sleep(20);
    const midPrevented = fire('touchmove', y + Math.round(distance * 0.55));
    await sleep(40);
    const duringTransform = window.getComputedStyle(sheet).transform;
    const duringInlineTransform = sheet.style.transform;
    const duringTop = sheet.getBoundingClientRect().top;
    const endPrevented = fire('touchmove', y + distance);
    await sleep(40);
    const endTransform = window.getComputedStyle(sheet).transform;
    const endInlineTransform = sheet.style.transform;
    const endTop = sheet.getBoundingClientRect().top;
    fire('touchend', y + distance);
    await sleep(360);

    return {
      midPrevented,
      endPrevented,
      duringTransform,
      duringInlineTransform,
      duringTop,
      endTransform,
      endInlineTransform,
      endTop,
      stillInDom: document.contains(sheet),
    };
  }, { handleSelector, distance });
}

test.describe('bottom sheet drag', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
    await page.route(`**/api/${SLUG}/waiter-calls/active`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          callId: 'playwright-active-call',
          status: 'pending',
          reason: 'bring_menu',
          createdAt: new Date(Date.now() - 45_000).toISOString(),
          acknowledgedAt: null,
          resolvedAt: null,
          cancelledAt: null,
        }),
      });
    });
  });

  test('CallWaiterSheet follows touch drag, snaps back, and dismisses past threshold', async ({ page }) => {
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Chamar garçom' }).first().click();
    const sheet = page.locator('[data-testid="call-waiter-sheet"]');
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(300);

    const shortDrag = await dragByTouch(
      page,
      '[data-testid="call-waiter-sheet"] [data-drag-handle="true"]',
      120,
    );
    expect(shortDrag.midPrevented).toBe(true);
    expect(shortDrag.endPrevented).toBe(true);
    expect(shortDrag.endInlineTransform).toBe('translateY(120px)');
    expect(shortDrag.endTop).toBeGreaterThan(shortDrag.duringTop);
    await expect(sheet).toBeVisible();

    const longDrag = await dragByTouch(
      page,
      '[data-testid="call-waiter-sheet"] [data-drag-handle="true"]',
      460,
    );
    expect(longDrag.endInlineTransform).toBe('translateY(460px)');
    await expect(sheet).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.body.style.position))
      .toBe('');
  });

  test('MenuOverlay drag handle follows touch drag and dismisses past threshold', async ({ page }) => {
    await page.route(`**/api/${SLUG}/assistant/message`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: 'Abro as bebidas pra você.',
          wasBlocked: false,
          suggestions: [],
          chips: [],
          linkedItems: [],
          toolCalls: [{ name: 'view_menu', arguments: { category: 'Bebidas' } }],
        }),
      });
    });

    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Pergunte alguma coisa...').fill('Quero ver opções de bebida');
    await page.getByPlaceholder('Pergunte alguma coisa...').press('Enter');

    const overlay = page.locator('[data-testid="menu-overlay"]');
    await expect(overlay).toBeVisible();
    await page.waitForTimeout(300);

    const shortDrag = await dragByTouch(
      page,
      '[data-testid="menu-overlay"] [data-drag-handle="true"]',
      160,
    );
    expect(shortDrag.midPrevented).toBe(true);
    expect(shortDrag.endPrevented).toBe(true);
    expect(shortDrag.endInlineTransform).toBe('translateY(160px)');
    expect(shortDrag.endTop).toBeGreaterThan(shortDrag.duringTop);
    await expect(overlay).toBeVisible();

    const longDrag = await dragByTouch(
      page,
      '[data-testid="menu-overlay"] [data-drag-handle="true"]',
      560,
    );
    expect(longDrag.endInlineTransform).toBe('translateY(560px)');
    await expect(overlay).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.body.style.position))
      .toBe('');
  });
});
