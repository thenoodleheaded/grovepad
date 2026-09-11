import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'grovepad-build-id',
      transformIndexHtml: {
        order: 'pre',
        handler: () => [{ tag: 'meta', attrs: { name: 'grovepad-build', content: buildId }, injectTo: 'head' }],
      },
    },
    {
      // Finder drops `.DS_Store` into any folder somebody opens, including
      // `public/`, and Vite copies that folder verbatim — so the files were
      // published at grovepad.app and served to anyone who asked. They list the
      // names of everything that was ever in the directory. Deleting them by
      // hand does not hold, because Finder writes them straight back; the build
      // has to be the thing that strips them.
      name: 'grovepad-strip-ds-store',
      apply: 'build',
      async closeBundle() {
        const { rm, readdir } = await import('node:fs/promises')
        const { join } = await import('node:path')
        const strip = async (dir: string): Promise<void> => {
          const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
          for (const entry of entries) {
            const path = join(dir, entry.name)
            if (entry.isDirectory()) await strip(path)
            else if (entry.name === '.DS_Store') await rm(path, { force: true })
          }
        }
        await strip('dist')
      },
    },
  ],
  server: {
    proxy: {
      '/api/canvas-lms': {
        target: 'https://grovepad.app',
        changeOrigin: true,
        headers: {
          Origin: 'https://grovepad.app',
          'Sec-Fetch-Site': 'same-origin',
        },
      },
    },
    watch: {
      // Tauri writes build artifacts (including .html reports) under
      // src-tauri/ while `tauri dev`/`tauri build` runs; without this the
      // web dev server full-page-reloads every time those files change.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: 'icons',
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 10,
              entriesAware: true,
              entriesAwareMergeThreshold: 20_000,
            },
          ],
        },
      },
    },
  },
})
