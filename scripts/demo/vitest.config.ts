import { defineConfig } from 'vitest/config'

// The demo-board generator runs through Vitest so it can import the app's own
// TypeScript modules (registry, field descriptors, serializer) directly. It is
// kept on its own config so `npm run test` never picks it up and writes files.
export default defineConfig({
  test: {
    root: '.',
    include: ['scripts/demo/buildDemoBoards.ts'],
  },
})
