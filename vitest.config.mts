import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws by design when loaded outside a server bundle. Tests run
      // in plain Node, so it is stubbed out here.
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Tests share one Postgres database and truncate between files, so they must
    // not run concurrently.
    fileParallelism: false,
    hookTimeout: 30000,
  },
})
