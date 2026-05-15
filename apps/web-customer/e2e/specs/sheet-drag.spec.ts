import { expect, test, type Page } from '@playwright/test';

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

async function seedSession(page: Page) {
  await page.addInitScript(
    ({ sessionId, bundle }) => {
      window.sessionStorage.setItem('session_token', sessionId);
      window.sessionStorage.setItem('session:bundle', JSON.stringify(bundle));
      window.sessionStorage.setItem('session:startedAt', new Date().toISOString());
    },
    { sessionId: SESSION_ID, bundle: SESSION_BUNDLE },
  );
}

async function dragByTouch(page: Page, handleSelector: string, distance: number) {
  return page.evaluate(
    async ({ handleSelector, distance }) => {
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
      // Sample the dismiss-target transform after React commits the setDragY
      // in finishDrag, but BEFORE the unmount timer (220ms) fires. This is
      // what the user sees during the close animation — it must push the
      // sheet entirely past the viewport bottom, otherwise the sheet leaves
      // a visible sliver while the backdrop has already gone (the
      // "split-state lâmina" bug).
      await sleep(40);
      const postEndInlineTransform = sheet.style.transform;
      const postEndTop = sheet.getBoundingClientRect().top;
      const postEndMeasured = sheet.offsetHeight;
      const viewportHeight = window.innerHeight;
      await sleep(320);

      return {
        midPrevented,
        endPrevented,
        duringTransform,
        duringInlineTransform,
        duringTop,
        endTransform,
        endInlineTransform,
        endTop,
        postEndInlineTransform,
        postEndTop,
        postEndMeasured,
        viewportHeight,
        stillInDom: document.contains(sheet),
      };
    },
    { handleSelector, distance },
  );
}

function parseTranslateY(value: string): number {
  const match = value.match(/translateY\(([\-0-9.]+)px\)/);
  return match ? Number.parseFloat(match[1]) : 0;
}

async function mockMenuTool(page: Page) {
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
}

async function openCallWaiterSheet(page: Page) {
  await page.getByRole('button', { name: 'Chamar garçom' }).first().click();
  const sheet = page.locator('[data-testid="call-waiter-sheet"]');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(300);
  return sheet;
}

async function openMenuOverlay(page: Page, messageSuffix = '') {
  await page
    .getByPlaceholder('Pergunte alguma coisa...')
    .fill(`Quero ver opções de bebida ${messageSuffix}`);
  await page.getByPlaceholder('Pergunte alguma coisa...').press('Enter');
  const overlay = page.locator('[data-testid="menu-overlay"]');
  await expect(overlay).toBeVisible({ timeout: 7_000 });
  await page.waitForTimeout(300);
  return overlay;
}

async function expectSheetClosed(page: Page, testId: string) {
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeHidden();
  await expect(page.locator(`[data-testid="${testId}"] > button[aria-label="Fechar"]`)).toHaveCount(
    0,
  );
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('');
}

async function getPanelInlineTransform(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]`).evaluate((dialog) => {
    const panel = Array.from(dialog.children).find(
      (el) => el instanceof HTMLElement && el.tagName === 'DIV',
    ) as HTMLElement | undefined;
    if (!panel) throw new Error(`Panel not found for ${testId}`);
    return panel.style.transform;
  });
}

async function getPanelTop(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]`).evaluate((dialog) => {
    const panel = Array.from(dialog.children).find(
      (el) => el instanceof HTMLElement && el.tagName === 'DIV',
    ) as HTMLElement | undefined;
    if (!panel) throw new Error(`Panel not found for ${testId}`);
    return panel.getBoundingClientRect().top;
  });
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

  test('CallWaiterSheet follows touch drag, snaps back, and dismisses past threshold', async ({
    page,
  }) => {
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });
    const sheet = await openCallWaiterSheet(page);

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
    // Split-state guard: after touchend (past threshold), the close
    // transform must push the sheet entirely past the viewport bottom.
    // Anything less leaves a visible sliver while the backdrop has
    // already faded — the bug we're fixing.
    const closeTransformPx = parseTranslateY(longDrag.postEndInlineTransform);
    expect(closeTransformPx).toBeGreaterThanOrEqual(longDrag.postEndMeasured);
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('');
  });

  test('MenuOverlay drag handle follows touch drag and dismisses past threshold', async ({
    page,
  }) => {
    await mockMenuTool(page);
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });
    const overlay = await openMenuOverlay(page);

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
    // Same split-state guard as CallWaiterSheet: MenuOverlay is taller
    // (88dvh vs 62dvh) so a height mismatch here would leave an even
    // bigger sliver. Close transform must exceed the measured height.
    const closeTransformPx = parseTranslateY(longDrag.postEndInlineTransform);
    expect(closeTransformPx).toBeGreaterThanOrEqual(longDrag.postEndMeasured);
    await expect(overlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('');
  });

  test('CallWaiterSheet dismiss never leaves a sliver visible during close', async ({ page }) => {
    // Concrete regression test for the "split-state lâmina" bug: the
    // backdrop fades on dismiss but the sheet stays as ~100-200px visible
    // at the viewport bottom because `setDragY(heightPx)` used a
    // window-fraction estimate instead of the actual sheet height.
    //
    // After touchend past threshold the sheet's TOP should be at or below
    // the viewport bottom — i.e., nothing of the sheet visible to the
    // user — for the entire close window until unmount.
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });
    const sheet = await openCallWaiterSheet(page);

    const result = await dragByTouch(
      page,
      '[data-testid="call-waiter-sheet"] [data-drag-handle="true"]',
      // Drag past threshold (`dismissThreshold = 0.6` of estimated height,
      // ~0.62 * 664 ≈ 412 → threshold ≈ 247). 500 is comfortably past.
      500,
    );

    expect(result.postEndTop).toBeGreaterThanOrEqual(result.viewportHeight);
    const closeTransformPx = parseTranslateY(result.postEndInlineTransform);
    // The translateY in pixels must be at least as large as the rendered
    // sheet height — otherwise the bottom portion of the sheet stays
    // inside the viewport.
    expect(closeTransformPx).toBeGreaterThanOrEqual(result.postEndMeasured);
    await expect(sheet).toBeHidden();
  });

  test('CallWaiterSheet can drag-dismiss 5 times without leaving the backdrop mounted', async ({
    page,
  }) => {
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });

    for (let i = 0; i < 5; i += 1) {
      await openCallWaiterSheet(page);
      const result = await dragByTouch(
        page,
        '[data-testid="call-waiter-sheet"] [data-drag-handle="true"]',
        500,
      );
      expect(parseTranslateY(result.postEndInlineTransform)).toBeGreaterThanOrEqual(
        result.postEndMeasured,
      );
      await expectSheetClosed(page, 'call-waiter-sheet');
    }
  });

  test('MenuOverlay can drag-dismiss 5 times without leaving the backdrop mounted', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await mockMenuTool(page);
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });

    for (let i = 0; i < 5; i += 1) {
      await openMenuOverlay(page, String(i));
      const result = await dragByTouch(
        page,
        '[data-testid="menu-overlay"] [data-drag-handle="true"]',
        600,
      );
      expect(parseTranslateY(result.postEndInlineTransform)).toBeGreaterThanOrEqual(
        result.postEndMeasured,
      );
      await expectSheetClosed(page, 'menu-overlay');
    }
  });

  test('CallWaiterSheet reopens with drag transform reset after drag-dismiss', async ({ page }) => {
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });

    await openCallWaiterSheet(page);
    await dragByTouch(page, '[data-testid="call-waiter-sheet"] [data-drag-handle="true"]', 500);
    await expectSheetClosed(page, 'call-waiter-sheet');

    await openCallWaiterSheet(page);
    expect(await getPanelInlineTransform(page, 'call-waiter-sheet')).toBe('');
    expect(await getPanelTop(page, 'call-waiter-sheet')).toBeLessThan(
      await page.evaluate(() => window.innerHeight),
    );
  });

  test('MenuOverlay reopens with drag transform reset after drag-dismiss', async ({ page }) => {
    await mockMenuTool(page);
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });

    await openMenuOverlay(page, 'first');
    await dragByTouch(page, '[data-testid="menu-overlay"] [data-drag-handle="true"]', 600);
    await expectSheetClosed(page, 'menu-overlay');

    await openMenuOverlay(page, 'second');
    expect(await getPanelInlineTransform(page, 'menu-overlay')).toBe('');
    expect(await getPanelTop(page, 'menu-overlay')).toBeLessThan(
      await page.evaluate(() => window.innerHeight),
    );
  });

  test('CallWaiterSheet backdrop tap closes and unlocks body scroll', async ({ page }) => {
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });
    await openCallWaiterSheet(page);

    await page
      .locator('[data-testid="call-waiter-sheet"] > button[aria-label="Fechar"]')
      .click({ position: { x: 20, y: 20 } });

    await expectSheetClosed(page, 'call-waiter-sheet');
  });

  test('MenuOverlay backdrop tap closes and unlocks body scroll', async ({ page }) => {
    await mockMenuTool(page);
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });
    await openMenuOverlay(page);

    await page
      .locator('[data-testid="menu-overlay"] > button[aria-label="Fechar"]')
      .click({ position: { x: 20, y: 20 } });

    await expectSheetClosed(page, 'menu-overlay');
  });
});
