import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadModule, parseSync } from 'pgsql-parser'

const migrationDir = resolve('supabase/migrations')
const migrations = readdirSync(migrationDir)
  .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
  .sort()

if (migrations.length === 0) throw new Error('No Supabase migrations found')
await loadModule()

let migrationCorpus = ''
for (const name of migrations) {
  const sql = readFileSync(resolve(migrationDir, name), 'utf8')
  parseSync(sql)
  migrationCorpus += `\n${sql.toLowerCase()}`
}

const requiredClauses = [
    'alter table public.boards enable row level security',
    'alter table public.board_indexes enable row level security',
    'alter table public.canvas_docs enable row level security',
    'alter table public.board_revisions enable row level security',
    'using ((select auth.uid()) = user_id)',
    'with check ((select auth.uid()) = user_id)',
    'security definer',
    'offset 30',
    'alter table public.canvas_crdt_updates enable row level security',
    'create policy canvas_crdt_updates_editor_insert',
    'create policy grovepad_canvas_member_receive on realtime.messages',
    'public.canvas_role(canvas_id) in (\'owner\', \'editor\')',
    'perform pg_advisory_xact_lock',
    'create or replace function public.delete_canvas_collaboration',
    // NULL-safe role guards: `<> 'owner'` lets non-members through, because
    // canvas_role returns NULL for them and `NULL <> 'owner'` is not true.
    "if public.canvas_role(p_canvas_id) is distinct from 'owner' then raise insufficient_privilege; end if;",
    "if coalesce(public.canvas_role(p_canvas_id)::text, '') not in ('owner', 'editor') then",
  ]
for (const clause of requiredClauses) {
  if (!migrationCorpus.includes(clause)) {
    throw new Error(`Supabase migrations are missing required database invariant: ${clause}`)
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
