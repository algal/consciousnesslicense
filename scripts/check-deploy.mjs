import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const databases = config.env?.production?.d1_databases;
if (!databases?.length || databases.some(db => !db.database_id || db.database_id === '00000000-0000-0000-0000-000000000000')) {
  console.error('Configure the production D1 database ID in env.production before deploying. See README.md.');
  process.exit(1);
}
