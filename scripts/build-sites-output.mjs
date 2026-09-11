import { copyFile, mkdir, writeFile } from 'node:fs/promises'

const worker = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || request.method !== 'GET') return response
    if (!request.headers.get('accept')?.includes('text/html')) return response

    const fallback = new URL('/index.html', request.url)
    return env.ASSETS.fetch(new Request(fallback, {
      method: 'GET',
      headers: request.headers,
    }))
  },
}
`

await mkdir('dist/server', { recursive: true })
await writeFile('dist/server/index.js', worker)
await mkdir('dist/.openai', { recursive: true })
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json')
