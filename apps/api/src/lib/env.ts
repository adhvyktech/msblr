import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  DEV_OTP_BYPASS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  JOBS_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  FCM_SERVICE_ACCOUNT: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}
export const env = parsed.data;
if (env.NODE_ENV === 'production' && env.DEV_OTP_BYPASS) {
  throw new Error('DEV_OTP_BYPASS must never be enabled in production');
}
export const isProd = env.NODE_ENV === 'production';
