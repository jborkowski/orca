import { defineConfig } from 'vitest/config'

// Why: the app-level mobile/vitest.config.ts only includes mobile/src, so this
// package owns its own config to keep its pure-logic tests runnable in isolation.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
