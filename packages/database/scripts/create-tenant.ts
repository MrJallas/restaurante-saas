import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/restaurant_saas';

async function createTenant(schemaName: string) {
  if (!schemaName) {
    console.error('Uso: ts-node create-tenant.ts <schema_name>');
    console.error('Exemplo: ts-node create-tenant.ts restaurant_dev');
    process.exit(1);
  }

  const safeName = schemaName.replace(/[^a-z0-9_]/g, '');
  if (safeName !== schemaName) {
    console.error(
      `Nome invalido. Use apenas letras minusculas, numeros e underscores. Sugestao: ${safeName}`,
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

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

    console.log(`\nTenant "${schemaName}" criado com sucesso!`);
  } catch (err) {
    console.error('Erro ao criar tenant:', err);
    throw err;
  } finally {
    await client.end();
  }
}

const schemaName = process.argv[2];
createTenant(schemaName).catch(() => process.exit(1));
