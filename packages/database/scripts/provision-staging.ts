/**
 * provision-staging.ts — provisiona os 2 tenants de staging do beta.
 *
 * Decisão Caleb #10: staging roda 1 tenant REAL (o restaurante beta) + 1
 * tenant DEMO (showcase pra mostrar ao cliente antes de onboardar).
 *
 *   - `staging_demo` (slug `demo`, "Restaurante Showcase") — tenant de
 *     demonstração. Recebe um seed MÍNIMO de showcase (1 categoria extra,
 *     2 itens, 2 mesas, 1 manager) pra ter algo visível na tela.
 *   - `staging_beta` (slug `beta`, "Beta — a definir") — CASCA do tenant
 *     REAL. Só schema + migrations + registro; o nome/menu reais entram no
 *     onboarding do cliente. Sem seed de showcase.
 *
 * Idempotente: re-run não duplica (createTenant usa CREATE SCHEMA IF NOT
 * EXISTS + __migrations__ tracking + UPSERT em public.restaurants; o seed
 * de showcase usa probes WHERE NOT EXISTS).
 *
 * NÃO faz seed pesado de menu/staff. O seed de showcase é intencionalmente
 * mínimo e SÓ toca `staging_demo`.
 *
 * CLI:
 *   ts-node scripts/provision-staging.ts
 *   npm run provision:staging            (em packages/database)
 *
 * DATABASE_URL aponta pro Postgres de staging (default = local dev).
 */

import { Client } from 'pg';
import * as crypto from 'crypto';
import { createTenant } from './create-tenant';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/restaurant_saas';

interface StagingTenant {
  schemaName: string;
  slug: string;
  name: string;
  /** Se true, aplica o seed mínimo de showcase (só o demo). */
  showcaseSeed: boolean;
}

const STAGING_TENANTS: StagingTenant[] = [
  {
    schemaName: 'staging_demo',
    slug: 'demo',
    name: 'Restaurante Showcase',
    showcaseSeed: true,
  },
  {
    schemaName: 'staging_beta',
    slug: 'beta',
    name: 'Beta — a definir',
    showcaseSeed: false,
  },
];

/** PIN → hash igual ao apps/api staff-pin.util (SHA-256 sem salt). */
function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/**
 * Seed MÍNIMO de showcase — SÓ pro staging_demo. Idempotente via
 * `WHERE NOT EXISTS` (não usa ON CONFLICT porque as colunas natural-key
 * não têm constraint UNIQUE, exceto `tables.code`).
 *
 * Conteúdo: 1 categoria "Destaques da Casa", 2 itens, 2 mesas, 1 manager.
 * As categorias default (Entradas/Principais/Bebidas/Sobremesas) já vêm do
 * seed tenant-template `default_categories.sql`.
 */
async function seedShowcase(client: Client, schemaName: string): Promise<void> {
  await client.query(`SET search_path = '${schemaName}'`);

  // 1. Categoria de destaque (idempotente por name).
  await client.query(`
    INSERT INTO menu_categories (name, description, sort_order)
    SELECT 'Destaques da Casa', 'Seleção do chef pra demonstração', 0
    WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE name = 'Destaques da Casa')
  `);

  // 2. Dois itens na categoria de destaque (idempotente por name).
  await client.query(`
    INSERT INTO menu_items (category_id, name, short_description, price_cents, is_available, is_featured, sort_order)
    SELECT c.id, 'Bruschetta da Casa', 'Pão artesanal, tomate e manjericão', 2900, true, true, 1
      FROM menu_categories c
     WHERE c.name = 'Destaques da Casa'
       AND NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Bruschetta da Casa')
  `);
  await client.query(`
    INSERT INTO menu_items (category_id, name, short_description, price_cents, is_available, is_featured, sort_order)
    SELECT c.id, 'Risoto de Cogumelos', 'Arbóreo, funghi e parmesão', 5900, true, true, 2
      FROM menu_categories c
     WHERE c.name = 'Destaques da Casa'
       AND NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Risoto de Cogumelos')
  `);

  // 3. Duas mesas (idempotente por code UNIQUE → ON CONFLICT).
  await client.query(`
    INSERT INTO tables (code, label, capacity, sort_order)
    VALUES ('D1', 'Mesa 1', 4, 1), ('D2', 'Mesa 2', 2, 2)
    ON CONFLICT (code) DO NOTHING
  `);

  // 4. Um manager (idempotente por name+role).
  await client.query(
    `
    INSERT INTO staff (name, role, pin_hash, is_active)
    SELECT 'Gerente Showcase', 'manager', $1, true
    WHERE NOT EXISTS (SELECT 1 FROM staff WHERE name = 'Gerente Showcase' AND role = 'manager')
  `,
    [hashPin('1234')],
  );

  await client.query(`SET search_path = 'public'`);
}

async function provisionStaging(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log(`[provision-staging] DATABASE_URL host = ${maskDbUrl(DATABASE_URL)}`);
  console.log(`[provision-staging] provisionando ${STAGING_TENANTS.length} tenant(s)...`);

  try {
    for (const t of STAGING_TENANTS) {
      console.log(`\n=== ${t.schemaName} (slug "${t.slug}") — "${t.name}" ===`);
      const result = await createTenant({
        schemaName: t.schemaName,
        slug: t.slug,
        name: t.name,
        databaseUrl: DATABASE_URL,
        client, // reusa a mesma conexão
      });
      console.log(
        `[provision-staging] ${t.schemaName}: registro em public.restaurants ${
          result.registeredNew ? 'CRIADO' : 'já existia (re-afirmado)'
        }`,
      );

      if (t.showcaseSeed) {
        console.log(`[provision-staging] aplicando seed mínimo de showcase em ${t.schemaName}...`);
        await seedShowcase(client, t.schemaName);
        console.log(
          `[provision-staging] seed de showcase OK (1 cat · 2 itens · 2 mesas · 1 manager PIN 1234)`,
        );
      }
    }

    console.log(`\n[provision-staging] OK — ${STAGING_TENANTS.length} tenant(s) provisionado(s).`);
    console.log(
      '[provision-staging] slugs disponíveis no router: ' +
        STAGING_TENANTS.map((t) => t.slug).join(', '),
    );
  } finally {
    await client.end();
  }
}

/** Esconde credenciais do log, mostra só host/db. */
function maskDbUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return '(url não parseável)';
  }
}

if (require.main === module) {
  provisionStaging().catch((err) => {
    console.error('[provision-staging] ERRO:', err);
    process.exit(1);
  });
}
