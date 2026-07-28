import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['tmp/demo/**/*.ts'], root: '.' },
})
