/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  build: { target: 'es2022' },
  server: { host: '127.0.0.1' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30_000 },
})
