import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resets msblr_test (migrate reset runs prisma/seed.ts) once before the whole run. Requires `npm run db:start`. */
export default function setup() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:54329/msblr_test',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    UPLOAD_DIR: './uploads-test',
    DEV_OTP_BYPASS: 'true',
  };
  fs.rmSync(path.join(cwd, 'uploads-test'), { recursive: true, force: true });
  try {
    execSync('npx prisma migrate reset --force --skip-generate', { cwd, env, stdio: 'pipe' });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `Could not reset msblr_test. Is the dev DB running (npm run db:start)?\n${err.stdout?.toString() ?? ''}\n${err.stderr?.toString() ?? ''}`,
    );
  }
}
