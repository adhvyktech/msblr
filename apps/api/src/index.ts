import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { env } from './lib/env';
import { buildApp } from './server';

/** Jobs: every src/jobs/*.ts default-exports `(app) => void | Promise<void>` that schedules itself with node-cron. */
async function startJobs(app: FastifyInstance) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'jobs');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => /\.(ts|js)$/.test(x) && !x.endsWith('.d.ts'))) {
    const mod = (await import(/* @vite-ignore */ pathToFileURL(path.join(dir, f)).href)) as { default?: (app: FastifyInstance) => unknown };
    if (typeof mod.default === 'function') {
      await mod.default(app);
      app.log.info(`job started: ${f}`);
    }
  }
}

const app = await buildApp();
await app.listen({ port: env.PORT, host: env.HOST });
console.log(`API listening on http://localhost:${env.PORT}`);
if (env.JOBS_ENABLED) await startJobs(app);
