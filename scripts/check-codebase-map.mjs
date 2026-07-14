import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const guidanceFiles = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/codebase-map.md']
const requiredHeadings = new Map([
  ['AGENTS.md', ['## First 90 seconds', '## Context discipline', '## Verification ladder']],
  ['CLAUDE.md', ['@AGENTS.md']],
  ['README.md', ['## Project navigation']],
  ['docs/codebase-map.md', ['## Task router', '## High-cost files: search before reading', '## Keeping the map trustworthy']],
])

const failures = []
let checkedLinks = 0

for (const relativeFile of guidanceFiles) {
  const absoluteFile = path.join(root, relativeFile)
  const source = await readFile(absoluteFile, 'utf8')

  for (const heading of requiredHeadings.get(relativeFile) ?? []) {
    if (!source.includes(heading)) failures.push(`${relativeFile}: missing required heading ${heading}`)
  }

  const links = source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)
  for (const match of links) {
    const target = match[1]?.trim()
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue
    const cleanTarget = decodeURIComponent(target.split('#', 1)[0] ?? '')
    if (!cleanTarget) continue
    const resolved = path.resolve(path.dirname(absoluteFile), cleanTarget)
    checkedLinks += 1
    try {
      await access(resolved)
    } catch {
      failures.push(`${relativeFile}: broken repository link ${target}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`Codebase guidance check failed (${failures.length} problem${failures.length === 1 ? '' : 's'}):`)
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log(`Codebase guidance check passed: ${guidanceFiles.length} files, ${checkedLinks} repository links.`)
}
