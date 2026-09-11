import { defineConfig } from 'vitest/config'

// The Skin Gallery generator runs through Vitest so it can import the app's
// own registry, skin resolution and sizing modules directly. Its own config
// keeps `npm run test` from picking it up and writing files.
export default defineConfig({
  test: { root: '.', include: ['scripts/skins/buildSkinGallery.ts'] },
})
