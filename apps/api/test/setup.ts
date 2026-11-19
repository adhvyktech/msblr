import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DB = 'postgresql://postgres:postgres@localhost:54329/msblr_test';

/**
 * Prepares the throwaway msblr_test database once before the whole run:
 * apply migrations (non-destructive), empty every table, then seed.
 * Refuses to run against any database whose name does not end in "_test".
 * Requires `npm run db:start`.
 */
export default async function setup() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const url = process.env.TEST_DATABASE_URL ?? TEST_DB;
  if (!/\/[\w-]+_test(\?|$)/.test(url)) throw new Error(`Refusing to reset non-test database: ${url}`);
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    UPLOAD_DIR: './uploads-test',
    DEV_OTP_BYPASS: 'true',
  };
  fs.rmSync(path.join(cwd, 'uploads-test'), { recursive: true, force: true });
  const run = (cmd: string) => {
    try {
      execSync(cmd, { cwd, env, stdio: 'pipe' });
    } catch (e) {
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      throw new Error(
        `Test DB setup failed at "${cmd}". Is the dev DB running (npm run db:start)?\n${err.stdout?.toString() ?? ''}\n${err.stderr?.toString() ?? ''}`,
      );
    }
  };
  run('npx prisma migrate deploy');

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (rows.length) {
      const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
  run('npx tsx prisma/seed.ts');
}
