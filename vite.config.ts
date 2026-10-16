import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
