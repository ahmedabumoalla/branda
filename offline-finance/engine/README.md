# Local original-finance database

`createEngine({dataDir})` opens PostgreSQL through the pinned PGlite package. The database lives under `dataDir/postgres`. First bootstrap and company setup each run in one transaction. Reopening a directory preserves the company and accounting data; it never reseeds or resets an existing company.

The schema export contains DDL only, obtained from `pg_catalog` on 2026-11-14. No application rows, user accounts, password hashes, or cloud credentials were exported. `schema/provenance.json` records the export query and schema hashes. The source contains 410 tables and 1,026 functions for the existing finance and ERP wrappers and their dependencies. Finance posting, inventory costing, reports, document rules, role checks and their triggers are loaded from these original function definitions, not reimplemented in JavaScript.

## Offline boundaries

- Local authentication supplies `auth.uid()` and the authenticated PostgreSQL role per transaction. Passwords and sessions belong to the HTTP server, not the finance SQL API.
- Subscription availability becomes local company availability. Platform administrator impersonation is disabled. Cancellation checks use the local company's archived/deleted status.
- Original finance/ERP function grants, table RLS, constraints and finance posting triggers are retained. Cloud marketing, loyalty and notification side-effect triggers are not activated.
- Catalog, brand identity, printer settings and media metadata use explicit local RLS backed by the original finance role check: active finance users can read their company; owner/manager can manage catalog/settings. Company identity changes are limited to its owner. Auth and password tables have no authenticated grants.
- Storage contains local metadata; the HTTP storage adapter owns file bytes and its signed-ticket authorization. Buckets are private. This engine does not send messages, call payment providers, connect printers or contact cloud services at runtime.

## Server-only contract

`querySystem(sql, params)` is trusted internal access and must never be exposed to a request as arbitrary SQL. `queryAs(userId, sql, params)` applies authenticated role and original RLS. `rpc(userId, name, args)` permits the finance/ERP RPC namespace and binds all values. The server must separately constrain RPC/action names to the actions it exposes.

`setupOwner`, `provisionUser`, `actorInfo`, `snapshot` and `execute` support local identity and original finance actions. The owner and company IDs persist in a private metadata table. User provisioning is internal; HTTP handlers must enforce owner authorization.

All database calls, identity transactions, archive export and close share one queue. `exportArchive()` checkpoints and syncs before returning a gzip Blob; callers must enforce owner access and include local file storage in their complete backup. `close()` waits for queued work and flushes PGlite. Restore must happen into a separate closed database directory, never by merging files into an open database.

The application backup adapter in `../backup.cjs` takes the application data root (which contains `database/postgres` and `files`). `exportBackup({engine,dataDir})` returns the `.branda` gzip JSON envelope. `restoreBackup({archive,dataDir})` accepts only a new/empty application data root and returns an open engine after validating checksums, safe paths and an active owner login. It never replaces existing data. The HTTP server owns staging promotion and must block mutations while exporting both database and file bytes. Limits are 256 MiB total components, 128 MiB compressed database, 10 MiB per file and 10,000 files.

## Verification

Run `node offline-finance/engine/check-engine.mjs` from the repository root. It uses disposable directories only and verifies atomic failed setup, owner/cashier identity, catalog RLS, password-table isolation, concurrent identity isolation, disabled users, storage metadata scope, disk reopening and actual gzip archive restoration into a new PGlite database. Results and exact input hashes are written to `verification.json`.

Original business action integration is covered by the separate actions tests. A database smoke test alone does not establish complete UI behavior, tax certification, external integrations or physical printer support.
