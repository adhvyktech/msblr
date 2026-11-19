import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { env } from './lib/env';
import { HttpError } from './lib/errors';
import { authenticate } from './lib/auth';
import { MAX_UPLOAD_BYTES } from './lib/files';

const here = path.dirname(fileURLToPath(import.meta.url));

interface ModuleExports {
  default?: FastifyPluginAsync;
  /** Optional: routes mounted at the server root (no /api prefix), e.g. GET /files/:id */
  rootRoutes?: FastifyPluginAsync;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'warn' },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 } });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => {
      const err = new HttpError(429, 'RATE_LIMITED', `Too many requests. Please try again in ${Math.ceil(ctx.ttl / 1000)} seconds.`);
      return err;
    },
  });

  app.decorate('authenticate', authenticate);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: details[0]?.message ?? 'Invalid input', details } });
    }
    const e = err as Error & { statusCode?: number; code?: string; validation?: unknown };
    if (e.statusCode === 429) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: e.message || 'Too many requests. Please try again shortly.' } });
    }
    if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.code === 'FST_FILES_LIMIT') {
      return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'This file is too large.' } });
    }
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: e.code ?? 'BAD_REQUEST', message: e.message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
  });
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url.split('?')[0]} not found` } }),
  );

  app.get('/api/health', async () => ({ data: { ok: true, time: new Date().toISOString() } }));

  // Auto-register src/modules/*/routes.ts under /api/<folder>
  const modulesDir = path.join(here, 'modules');
  const names = fs.existsSync(modulesDir)
    ? fs.readdirSync(modulesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    : [];
  for (const name of names) {
    const file = ['routes.ts', 'routes.js'].map((f) => path.join(modulesDir, name, f)).find((f) => fs.existsSync(f));
    if (!file) continue;
    const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as ModuleExports;
    if (mod.default) await app.register(mod.default, { prefix: `/api/${name}` });
    if (mod.rootRoutes) await app.register(mod.rootRoutes);
  }
  return app;
}
