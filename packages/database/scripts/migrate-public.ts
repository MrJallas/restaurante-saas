import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/restaurant_saas';

async function migratePublic() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const migrationsDir = path.join(__dirname, '..', 'migrations', 'public');
  const files = fs.readdirSync(migrationsDir).sort();

  console.log(`Rodando ${files.length} migrations no schema public...`);

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`  -> ${file}`);
    await client.query(sql);
  }

  console.log('Migrations do schema public concluidas.');
  await client.end();
}

migratePublic().catch((err) => {
  console.error('Erro ao rodar migrations:', err);
  process.exit(1);
});
