import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadModule, parseSync } from 'pgsql-parser'

const migrationDir = resolve('supabase/migrations')
const migrations = readdirSync(migrationDir)
  .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
  .sort()

if (migrations.length === 0) throw new Error('No Supabase migrations found')
await loadModule()

for (const name of migrations) {
  const sql = readFileSync(resolve(migrationDir, name), 'utf8')
  parseSync(sql)

  const requiredClauses = [
    'alter table public.boards enable row level security',
    'alter table public.board_indexes enable row level security',
    'alter table public.canvas_docs enable row level security',
    'alter table public.board_revisions enable row level security',
    'using ((select auth.uid()) = user_id)',
    'with check ((select auth.uid()) = user_id)',
    'security definer',
    'offset 30',
  ]
  for (const clause of requiredClauses) {
    if (!sql.toLowerCase().includes(clause)) {
      throw new Error(`${name} is missing required database invariant: ${clause}`)
    }
  }
}

console.log(`Supabase migration check passed: ${migrations.length} migration(s) parsed`)

const testDir = resolve('supabase/tests/database')
const tests = readdirSync(testDir).filter((name) => name.endsWith('.sql')).sort()
if (tests.length === 0) throw new Error('No Supabase database tests found')
for (const name of tests) {
  parseSync(readFileSync(resolve(testDir, name), 'utf8'))
}
console.log(`Supabase database test syntax passed: ${tests.length} test file(s) parsed`)
