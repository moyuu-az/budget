import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two test projects, because the two halves of this application need different
// runtimes: the renderer wants a DOM, and the server wants real Node plus (for
// the schema tests) a real PostgreSQL in Docker.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'happy-dom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}', 'shared/**/*.{test,spec}.ts'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: ['server/**/*.{test,spec}.ts'],
          // Pulling and booting a PostgreSQL container dominates the first run.
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}', 'shared/**/*.ts', 'server/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/*.stories.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/**/*.d.ts',
        'server/test/**',
        'server/**/*.{test,spec}.ts',
      ],
    },
  },
});
