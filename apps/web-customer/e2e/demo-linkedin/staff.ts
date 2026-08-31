import type { Page } from '@playwright/test';
import { beat, settle, typeSlow } from './cine';

/**
 * Login do app de staff (porta 3002). O staff entra por CPF + PIN — não há
 * email/senha. Os CPFs abaixo são fixtures sintéticos do seed do tenant de
 * desenvolvimento (`900000000XX`), não são documentos de pessoas reais.
 */

export const STAFF_URL = process.env.DEMO_STAFF_URL || 'http://localhost:3002';

export const STAFF = {
  owner: { cpf: '90000000000', nome: 'Dona Demo', rota: '/manager' },
  manager: { cpf: '90000000001', nome: 'Gerente Demo', rota: '/manager' },
  host: { cpf: '90000000002', nome: 'Recepcao Demo', rota: '/host' },
  waiter: { cpf: '90000000003', nome: 'Garcom Demo', rota: '/waiter' },
  cook: { cpf: '90000000004', nome: 'Cozinha Demo', rota: '/cozinha' },
} as const;

export type StaffRole = keyof typeof STAFF;

const PIN = '1234';

/**
 * Entra como o papel pedido e para na rota dele. Limpa storage antes porque
 * sessão de staff é server-side: cookie sobrevivente de um container antigo
 * cai em "Sessão expirada" e a gravação começa com erro na tela.
 */
export async function loginStaff(page: Page, role: StaffRole, mostrarLogin = true) {
  const { cpf, rota } = STAFF[role];

  await page.goto(`${STAFF_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* storage bloqueado — segue */
    }
  });
  await page.context().clearCookies();
  await page.goto(`${STAFF_URL}/login`, { waitUntil: 'domcontentloaded' });
  await settle(page, 1200);

  const campoCpf = page.getByRole('textbox').first();
  const campoPin = page.locator('input[type="password"]').first();

  if (mostrarLogin) {
    // Digitação visível: o login por CPF+PIN é parte do produto, vale mostrar.
    await typeSlow(campoCpf, cpf, 45);
    await beat(page, 500);
    await typeSlow(campoPin, PIN, 120);
    await beat(page, 800);
  } else {
    await campoCpf.fill(cpf);
    await campoPin.fill(PIN);
  }

  await page.locator('button[type=submit]').click();
  await page.waitForURL(`**${rota}**`, { timeout: 25_000 }).catch(() => {});
  await settle(page, 2200);
}
