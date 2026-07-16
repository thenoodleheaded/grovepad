# Grovepad cloud database deployment

The repository owns the Supabase schema from `supabase/migrations/`. Do not make equivalent changes directly in the Dashboard table editor; remote-only edits bypass migration history.

## What the migration installs

- `board_indexes`: one small, readable document index per user.
- `canvas_docs`: independently checksummed and gzip-compressed canvas bodies.
- `board_revisions`: append-only index/canvas receipts, pruned to the newest 30 revisions per document.
- Server-owned `updated_at` and monotonic `rev` triggers.
- Owner-only RLS for the legacy and new tables; anonymous access is revoked.
- A transition window in which the client writes the legacy `boards` row first and commits split documents by updating the index last.

The client reads the newer server timestamp. A newer legacy row means an old client wrote after the last split-document commit, or a multi-row sync stopped early; Grovepad then reads the legacy recovery row and rebuilds the split documents.

## Local verification

`npm run db:check` parses every migration with the PostgreSQL 17 grammar and verifies the required RLS/revision clauses. With Docker available, run:

```sh
npx supabase@2.109.1 db start
npx supabase@2.109.1 test db
```

The pgTAP suite verifies policy names, tenant-isolated reads/writes, anonymous denial, and revision creation.

## Link and deploy

Use a Supabase personal access token and the database password from the project dashboard. Never place either value in a Vite variable or commit it.

```sh
npx supabase@2.109.1 login
npx supabase@2.109.1 link --project-ref <project-ref>
npx supabase@2.109.1 migration list
npx supabase@2.109.1 db push --dry-run
npx supabase@2.109.1 db push
npx supabase@2.109.1 test db --linked
```

The CLI's pgTAP runner requires Docker even for `--linked`. On a machine without
Docker, execute the same rollback-only SQL directly through the linked Management
API and inspect every TAP row for `ok`:

```sh
npx supabase@2.109.1 db query --linked \
  --file supabase/tests/database/cloud_documents_rls.test.sql
```

After deployment, sign into two test accounts and confirm each account sees only its own board. The application automatically migrates the first legacy sync; keep the `boards` table through at least one release window before a separate audited removal migration.
