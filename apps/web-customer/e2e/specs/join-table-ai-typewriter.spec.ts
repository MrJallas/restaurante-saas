import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  activeSessions,
  fillWelcome,
  nextCpf,
  openCustomerViaQr,
  participantsForSession,
  preReleaseTable,
  psqlJson,
  resetQrTables,
  sqlLiteral,
  waitFor,
} from '../helpers/physical-qr';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const TABLE_CODE = 'QRTEST91';
const REPORT_DIR = path.resolve(__dirname, '../../../../qa-reports/join-table-ai-typewriter');
const IPHONE_14 = devices['iPhone 14'];

let cpfSeed = Math.floor(Date.now() % 100_000);
let ipSeed = Math.floor(Date.now() % 60_000);

interface AssistantToolAuditRow {
  user_message: string;
  tool_calls: Array<{
    name?: string;
    function?: { name?: string };
  }> | null;
}

function freshCpf(): string {
  cpfSeed += 1;
  return nextCpf(cpfSeed);
}

function nextBrowserIp(): string {
  ipSeed += 1;
  const normalized = Math.abs(ipSeed) % 65_536;
  return `198.21.${Math.floor(normalized / 256)}.${normalized % 256}`;
}

async function newMobileContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    ...IPHONE_14,
    geolocation: { latitude: -23.56, longitude: -46.64 },
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'x-forwarded-for': nextBrowserIp() },
  });
}

async function openHost(page: Page): Promise<string> {
  await preReleaseTable(TABLE_CODE);
  await openCustomerViaQr(page, TABLE_CODE);
  await fillWelcome(page, 'Host IA Mesa', freshCpf());
  await expect(page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i })).toBeVisible({
    timeout: 20_000,
  });

  const session = activeSessions(TABLE_CODE)[0];
  expect(session?.id).toBeTruthy();
  await page.goto('/restaurant_dev/assistente', { waitUntil: 'domcontentloaded' });
  await expect(page.getByPlaceholder('Pergunte alguma coisa...')).toBeVisible({
    timeout: 20_000,
  });
  return session.id;
}

async function requestJoin(page: Page, name: string): Promise<void> {
  await openCustomerViaQr(page, TABLE_CODE);
  await fillWelcome(page, name, freshCpf());
  await expect(page.getByTestId('waiting-approval')).toBeVisible({ timeout: 20_000 });
}

async function sendAssistantMessage(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder('Pergunte alguma coisa...');
  await expect(input).toBeEnabled({ timeout: 15_000 });
  await input.fill(text);
  await input.press('Enter');
}

function assistantToolNamesForSession(sessionId: string): string[] {
  const rows = psqlJson<AssistantToolAuditRow>(
    `SELECT user_message, tool_calls
       FROM restaurant_dev.assistant_messages
      WHERE table_session_id = ${sqlLiteral(sessionId)}
        AND tool_calls IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 12`,
  );
  return rows.flatMap((row) =>
    (row.tool_calls ?? []).map((call) => call.name ?? call.function?.name ?? ''),
  );
}

test('host aprova e recusa pedido de entrada pelo assistente com TypewriterBubble', async ({
  browser,
}) => {
  resetQrTables([TABLE_CODE]);
  await mkdir(REPORT_DIR, { recursive: true });

  const hostContext = await newMobileContext(browser);
  const joinContext = await newMobileContext(browser);
  const rejectContext = await newMobileContext(browser);
  try {
    const hostPage = await hostContext.newPage();
    const sessionId = await openHost(hostPage);

    const joinPage = await joinContext.newPage();
    await requestJoin(joinPage, 'Cliente IA Join');

    const approveBubble = hostPage
      .getByTestId('assistant-join-request-bubble')
      .filter({ hasText: /Cliente IA Join/i });
    await expect(approveBubble).toBeVisible({ timeout: 25_000 });
    await expect(approveBubble.getByRole('button', { name: 'Pode entrar' })).toBeVisible({
      timeout: 10_000,
    });
    await hostPage.screenshot({
      path: path.join(REPORT_DIR, '01-host-typewriter-approval.png'),
      fullPage: true,
    });

    await sendAssistantMessage(hostPage, 'pode');
    await expect(hostPage.getByTestId('tool-indicator-accept_join_request')).toBeVisible({
      timeout: 20_000,
    });
    await expect(approveBubble).toContainText('Entrada aprovada', { timeout: 20_000 });
    await expect(
      joinPage.getByRole('button', { name: /Chamar garçom|Chamar garcom/i }),
    ).toBeVisible({ timeout: 20_000 });
    await waitFor(
      () =>
        participantsForSession(sessionId).find((p) => p.customer_name === 'Cliente IA Join')
          ?.status,
      (status) => status === 'approved',
      15_000,
    );
    await hostPage.screenshot({
      path: path.join(REPORT_DIR, '02-host-approval-decision.png'),
      fullPage: true,
    });
    await joinPage.screenshot({
      path: path.join(REPORT_DIR, '03-joiner-approved.png'),
      fullPage: true,
    });

    const rejectPage = await rejectContext.newPage();
    await requestJoin(rejectPage, 'Cliente IA Reject');

    const rejectBubble = hostPage
      .getByTestId('assistant-join-request-bubble')
      .filter({ hasText: /Cliente IA Reject/i });
    await expect(rejectBubble).toBeVisible({ timeout: 25_000 });
    await expect(rejectBubble.getByRole('button', { name: 'Agora não' })).toBeVisible({
      timeout: 10_000,
    });
    await hostPage.screenshot({
      path: path.join(REPORT_DIR, '04-host-typewriter-rejection.png'),
      fullPage: true,
    });

    await sendAssistantMessage(hostPage, 'agora não');
    await expect(hostPage.getByTestId('tool-indicator-reject_join_request')).toBeVisible({
      timeout: 20_000,
    });
    await expect(rejectBubble).toContainText('Entrada recusada', { timeout: 20_000 });
    await expect(
      rejectPage.getByText(/não autorizou|nao autorizou|não autorizada|nao autorizada/i),
    ).toBeVisible({ timeout: 20_000 });
    await waitFor(
      () =>
        participantsForSession(sessionId).find((p) => p.customer_name === 'Cliente IA Reject')
          ?.status,
      (status) => status === 'rejected',
      15_000,
    );
    await hostPage.screenshot({
      path: path.join(REPORT_DIR, '05-host-rejection-decision.png'),
      fullPage: true,
    });
    await rejectPage.screenshot({
      path: path.join(REPORT_DIR, '06-joiner-rejected.png'),
      fullPage: true,
    });

    const toolNames = assistantToolNamesForSession(sessionId);
    expect(toolNames).toContain('accept_join_request');
    expect(toolNames).toContain('reject_join_request');
  } finally {
    await hostContext.close();
    await joinContext.close();
    await rejectContext.close();
  }
});
