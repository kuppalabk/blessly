import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/wishwell_test', APP_URL: 'http://localhost:3000', ENCRYPTION_KEY: 'dGVzdC1vbmx5LWtleS0zMi1ieXRlcy1sb25nLi4uLi4=', WHATSAPP_APP_SECRET: 'test-app-secret' }
  }
});
