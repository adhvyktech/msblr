import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/setup.ts'],
    fileParallelism: false, // all files share the msblr_test database
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54329/msblr_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123',
      UPLOAD_DIR: './uploads-test',
      DEV_OTP_BYPASS: 'true',
      JOBS_ENABLED: 'false',
      CORS_ORIGINS: 'http://localhost:5173',
    },
  },
});
