import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: './tests/global-setup.ts',
    testTimeout: 60000,
    fileParallelism: false, // SQLite is a single-writer DB; run files sequentially
    env: {
      DATABASE_URL: 'file:/home/z/my-project/db/test.db',
      AI_PROVIDER: 'mock',
      QUEUE_DRIVER: 'memory',
    },
  },
});
