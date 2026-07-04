import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/restaurant_saas';

export interface CreateTenantOptions {
  /** Schema Postgres do tenant (ex.: `restaurant_dev`). */
  schemaName: string;
  /** Slug usado no router (`:slug` → public.restaurants.schema_name). Default = schemaName. */
  slug?: string;
  /** Nome de exibição do restaurante. Default derivado do slug. */
  name?: string;
  /** Email do dono (NOT NULL em public.restaurants). Default derivado do schema. */
  ownerEmail?: string;
  /** Nome do dono (NOT NULL em public.restaurants). Default = name. */
  ownerName?: string;
  /** Connection string alternativa (ex.: staging). Default = env/local. */
  databaseUrl?: string;
  /** Reusar um Client já conectado (evita re-conectar em provisionamentos em lote). */
  client?: Client;
}

/**
 * Deriva um nome legível a partir do slug/schema:
 *   `restaurant_dev` → `Restaurant Dev`
 */
function deriveName(base: string): string {
  return base
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Registra o tenant em `public.restaurants` de forma IDEMPOTENTE.
 *
 * O router (apps/api tenant.middleware) resolve `:slug` via
 * `SELECT id, schema_name, is_active FROM public.restaurants WHERE slug = $1`.
 * Sem esta linha, o schema existe mas o tenant é INVISÍVEL ao router.
 *
 * `public.restaurants` tem colunas NOT NULL além de slug/schema_name/name:
 * `plan_id` (FK → public.plans), `owner_email`, `owner_name`. Garantimos um
 * plano default antes do UPSERT — `migrate-public.ts` cria a tabela `plans`
 * mas não semeia nenhuma linha.
 *
 * O UPSERT usa `ON CONFLICT (slug)` mantendo o `id` estável (re-run não
 * duplica nem re-gera UUID) e re-afirmando `is_active = true`.
 */
async function registerRestaurant(
  client: Client,
  opts: { slug: string; schemaName: string; name: string; ownerEmail: string; ownerName: string },
): Promise<{ created: boolean }> {
  // search_path pode estar apontando pro schema do tenant — sempre qualifique
  // com `public.` explicitamente para o UPSERT abaixo.

  // 1. Garantir um plano default (idempotente). `plans.name` não é UNIQUE,
  //    então usamos um probe + insert condicional em vez de ON CONFLICT.
  await client.query(`
    INSERT INTO public.plans (name, description, price_cents, features, max_tables, max_staff, max_ai_messages_per_day)
    SELECT 'Starter', 'Plano default provisionado por create-tenant', 0, '{}'::jsonb, 20, 10, 500
    WHERE NOT EXISTS (SELECT 1 FROM public.plans)
  `);

  // 2. UPSERT do restaurante. Não sobrescreve schema_name (chave estrutural)
  //    para não repontar um slug existente pra outro schema por engano — se o
  //    slug já existe apontando pra OUTRO schema, isso é um conflito de
  //    configuração e o operador deve resolver manualmente.
  const { rows } = await client.query<{ inserted: boolean; existing_schema: string }>(
    `
    INSERT INTO public.restaurants (slug, schema_name, name, plan_id, owner_email, owner_name, is_active)
    VALUES ($1, $2, $3, (SELECT id FROM public.plans ORDER BY created_at ASC LIMIT 1), $4, $5, true)
    ON CONFLICT (slug) DO UPDATE
      SET name       = EXCLUDED.name,
          is_active  = true,
          updated_at = now()
    RETURNING (xmax = 0) AS inserted, schema_name AS existing_schema
    `,
    [opts.slug, opts.schemaName, opts.name, opts.ownerEmail, opts.ownerName],
  );

  const row = rows[0];
  if (row && row.existing_schema !== opts.schemaName) {
    throw new Error(
      `Slug "${opts.slug}" já registrado apontando pro schema "${row.existing_schema}", ` +
        `não pro schema "${opts.schemaName}" solicitado. Resolva o conflito manualmente.`,
    );
  }
  return { created: Boolean(row?.inserted) };
}

export async function createTenant(
  optionsOrSchema: CreateTenantOptions | string,
): Promise<{ schemaName: string; slug: string; name: string; registeredNew: boolean }> {
  const options: CreateTenantOptions =
    typeof optionsOrSchema === 'string' ? { schemaName: optionsOrSchema } : optionsOrSchema;

  const schemaName = options.schemaName;
  if (!schemaName) {
    throw new Error('schemaName é obrigatório');
  }

  const safeName = schemaName.replace(/[^a-z0-9_]/g, '');
  if (safeName !== schemaName) {
    throw new Error(
      `Nome de schema invalido. Use apenas letras minusculas, numeros e underscores. Sugestao: ${safeName}`,
    );
  }

  const slug = options.slug || schemaName;
  const name = options.name || deriveName(slug);
  const ownerName = options.ownerName || name;
  const ownerEmail = options.ownerEmail || `owner@${slug.replace(/[^a-z0-9]/g, '')}.local`;

  // Client compartilhado (batch) ou próprio.
  const ownClient = !options.client;
  const client =
    options.client || new Client({ connectionString: options.databaseUrl || DATABASE_URL });
  if (ownClient) {
    await client.connect();
  }

  try {
    // 1. Criar schema
    console.log(`Criando schema: ${schemaName}`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    await client.query(`SET search_path = '${schemaName}'`);

    // 2. Rodar migrations do tenant-template
    const migrationsDir = path.join(__dirname, '..', 'migrations', 'tenant-template');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // Round 4 §C-NEW-1: criar tabela `__migrations__` ANTES de rodar pra
    // que cada migration seja registrada. Sem isso, migrate-tenants.ts
    // (boot da API) re-aplica todas em tenants frescos.
    await client.query(`
      CREATE TABLE IF NOT EXISTS __migrations__ (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    console.log(`Rodando ${migrationFiles.length} migrations...`);
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`  -> ${file}`);
      await client.query(sql);
      await client.query(
        `INSERT INTO __migrations__(filename) VALUES ($1) ON CONFLICT DO NOTHING`,
        [file],
      );
    }

    // 3. Rodar seeds
    const seedsDir = path.join(__dirname, '..', 'seeds', 'tenant-template');
    const seedFiles = fs
      .readdirSync(seedsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`Rodando ${seedFiles.length} seeds...`);
    for (const file of seedFiles) {
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf-8');
      console.log(`  -> ${file}`);
      await client.query(sql);
    }

    // 4. Registrar em public.restaurants (senão o router não enxerga o tenant).
    // SET search_path acima aponta pro schema do tenant; registerRestaurant
    // qualifica tudo com `public.` explicitamente.
    const { created } = await registerRestaurant(client, {
      slug,
      schemaName,
      name,
      ownerEmail,
      ownerName,
    });
    console.log(
      created
        ? `Registrado em public.restaurants: slug="${slug}" → schema="${schemaName}"`
        : `public.restaurants já tinha slug="${slug}" (re-afirmado is_active=true)`,
    );

    console.log(`\nTenant "${schemaName}" (slug "${slug}") pronto!`);
    return { schemaName, slug, name, registeredNew: created };
  } catch (err) {
    console.error('Erro ao criar tenant:', err);
    throw err;
  } finally {
    if (ownClient) {
      await client.end();
    }
  }
}

/** Parse mínimo de flags `--slug`/`--name` + posicional schema. */
function parseArgv(argv: string[]): CreateTenantOptions | null {
  const positional: string[] = [];
  const opts: Partial<CreateTenantOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--slug') {
      opts.slug = argv[++i];
    } else if (a === '--name') {
      opts.name = argv[++i];
    } else if (a.startsWith('--slug=')) {
      opts.slug = a.slice('--slug='.length);
    } else if (a.startsWith('--name=')) {
      opts.name = a.slice('--name='.length);
    } else {
      positional.push(a);
    }
  }
  if (!positional[0]) return null;
  return { schemaName: positional[0], ...opts };
}

// CLI entrypoint — só roda quando invocado diretamente (não em import).
if (require.main === module) {
  const parsed = parseArgv(process.argv.slice(2));
  if (!parsed) {
    console.error('Uso: ts-node create-tenant.ts <schema_name> [--slug <slug>] [--name <name>]');
    console.error(
      'Exemplo: ts-node create-tenant.ts restaurant_dev --slug demo --name "Restaurante Demo"',
    );
    process.exit(1);
  }
  createTenant(parsed).catch(() => process.exit(1));
}
