// Starts an embedded PostgreSQL for local dev. Port 54329, postgres/postgres, data in .devdb/
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.devdb');
const PORT = 54329;
const DBS = ['msblr', 'msblr_test'];

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (e) => { const s = String(e); if (/error|fatal/i.test(s)) console.error('[pg]', s.trim()); },
});

const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (fresh) {
  console.log('Initialising new data directory at .devdb ...');
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rows } = await client.query('SELECT datname FROM pg_database');
const have = new Set(rows.map((r) => r.datname));
for (const db of DBS) {
  if (!have.has(db)) {
    await client.query(`CREATE DATABASE ${db}`);
    console.log('Created database', db);
  }
}
await client.end();
console.log(`Embedded PostgreSQL ready on postgresql://postgres:postgres@localhost:${PORT}  (dbs: ${DBS.join(', ')}). Ctrl-C to stop.`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping PostgreSQL ...');
  try { await pg.stop(); } catch (e) { console.error(e); }
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
