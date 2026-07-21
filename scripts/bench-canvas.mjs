#!/usr/bin/env node
// Canvas engine benchmark runner (docs/canvas-engine.md, "Performance gates").
// Spawns the dev server, drives the in-page bench harness (?bench=1) in
// Chromium at 1x and 4x CPU throttle, prints the gate table, and writes JSON
// artifacts to bench/results/. Headless rAF has no real display vsync, so
// treat headed runs (BENCH_HEADED=1) as the reference numbers.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'

const PORT = Number(process.env.BENCH_PORT ?? 5199)
const BASE_URL = process.env.BENCH_URL ?? `http://localhost:${PORT}`
const HEADED = process.env.BENCH_HEADED === '1'
const THROTTLE_RATES = (process.env.BENCH_RATES ?? '1,4').split(',').map(Number)

function resolvePlaywright() {
  const roots = [process.cwd(), '/tmp/playwright-env', path.join(homedir(), '.playwright-env')]
  for (const root of roots) {
    try {
      const require = createRequire(path.join(root, 'noop.js'))
      return require('playwright-core')
    } catch {
      // try next root
    }
  }
  return null
}

function findChromium() {
  const cacheRoots = [
    path.join(homedir(), 'Library/Caches/ms-playwright'),
    path.join(homedir(), '.cache/ms-playwright'),
  ]
  for (const root of cacheRoots) {
    if (!existsSync(root)) continue
    const entry = readdirSync(root).filter((name) => /^chromium-\d+$/.test(name)).sort().pop()
    if (!entry) continue
    const candidates = [
      path.join(root, entry, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      path.join(root, entry, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      path.join(root, entry, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
      path.join(root, entry, 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium'),
      path.join(root, entry, 'chrome-linux/chrome'),
    ]
    for (const candidate of candidates) if (existsSync(candidate)) return candidate
  }
  return null
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`dev server never answered at ${url}`)
}

async function main() {
  const playwright = resolvePlaywright()
  if (!playwright) {
    console.error(
      'playwright-core not found. Install it once (npm i -D playwright-core) or ' +
        'provide it at /tmp/playwright-env, plus a cached ms-playwright Chromium.',
    )
    process.exit(2)
  }
  const executablePath = findChromium()
  if (!executablePath) {
    console.error('No cached ms-playwright Chromium found (npx playwright install chromium).')
    process.exit(2)
  }

  let server = null
  if (!process.env.BENCH_URL) {
    // BENCH_PROD=1: measure the production bundle (minified, no HMR client,
    // no on-demand transforms) — the honest instrument for merge gates. Dev
    // mode stays the default for fast iteration.
    if (process.env.BENCH_PROD === '1') {
      console.log('building production bundle…')
      const build = spawn('npx', ['vite', 'build'], { stdio: 'inherit' })
      await new Promise((resolve, reject) => {
        build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))))
      })
      server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
        stdio: 'ignore',
        detached: false,
      })
    } else {
      server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
        stdio: 'ignore',
        detached: false,
      })
    }
  }
  try {
    await waitForServer(BASE_URL)
    const browser = await playwright.chromium.launch({ executablePath, headless: !HEADED })
    const results = []
    try {
      for (const rate of THROTTLE_RATES) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await context.newPage()
        const cdp = await context.newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate })
        await page.goto(`${BASE_URL}/?bench=1`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => Boolean(window.__grovepadBench), null, { timeout: 30_000 })
        const label = `cpu-${rate}x${HEADED ? '-headed' : '-headless'}`
        console.log(`\n▶ ${label} …`)
        const report = await page.evaluate(
          (runLabel) => window.__grovepadBench.run(runLabel),
          label,
        )
        results.push(report)
        printReport(report)
        await context.close()
      }
    } finally {
      await browser.close()
    }

    const outDir = path.join(process.cwd(), 'bench', 'results')
    mkdirSync(outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outFile = path.join(outDir, `${stamp}.json`)
    writeFileSync(outFile, JSON.stringify(results, null, 2))
    console.log(`\nWrote ${outFile}`)

    const requiredPassed = results
      .filter((r) => r.label.startsWith('cpu-'))
      .every((r) => r.gates.find((g) => g.gate.includes('60Hz'))?.pass)
    process.exit(requiredPassed ? 0 : 1)
  } finally {
    server?.kill('SIGTERM')
  }
}

function printReport(report) {
  console.log(
    `  widgets=${report.widgetCount} edges=${report.edgeCount} prepare=${Math.round(report.prepareMs)}ms ` +
      `frames=${report.frame.frames} mean=${report.frame.meanMs.toFixed(2)}ms ` +
      `p95=${report.frame.p95Ms.toFixed(2)}ms p99=${report.frame.p99Ms.toFixed(2)}ms ` +
      `longest=${report.frame.longestMs.toFixed(1)}ms longTasks=${report.frame.longTasks}`,
  )
  for (const gate of report.gates) {
    console.log(`  ${gate.pass ? 'PASS' : 'FAIL'}  ${gate.gate} — ${gate.detail}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
