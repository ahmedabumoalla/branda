# Proposed Branda / Money integration

Inspected 2026-10-24. Proposal only: no cross-project connector, database cutover or offline queue has been implemented. Money sources read only at C:/Projects/money; do not open its live PGlite directory in another process. Branda application remains local-only. Current shift migrations are unapplied drafts.

## Observed implementation

- Branda: Next.js, Supabase Auth and tenant-authorized financial RPCs, separate owner dashboard and financial cashier, menu and loyalty ownership
- Money: React/Vite/TanStack Query UI; NestJS/Fastify API; PostgreSQL adapter via DATABASE_URL; PGlite fallback for local development, not a production concurrency result
- Money platform/context.ts already binds command receipts to tenant, actor, operation, request key, payload and permission scope in one transaction with audit/outbox
- Money platform/routes.ts owns opaque erp_session cookies; security.ts reauthorizes tenant/branch permissions; no Branda identity federation found in inspected integration/auth source
- Money domains/pos.ts and web/Pos.tsx implement a versioned shift workflow with closing/count/reconcile stages; existing pos_cashier role is not automatically authorized for all sales/purchase actions
- Money direct-purchases, inventory, treasury and billing domains exist; broad ERP/HIS completion is explicitly not established by its handoff
- Offline browser persistence is not implemented by the inspected Money API/POS client; architecture document explicitly avoids browser storage of tokens/clinical data

## Recommended ownership

| Data | Authoritative owner | Integration |
| --- | --- | --- |
| Brand, subscription, user identity, Branda role grants | Branda | Explicit tenant/user/branch mappings and revocation events |
| Menu presentation, categories, images, publication | Branda | Versioned catalog projection inside Money and cashier device |
| Accounting stock items, purchasing costs, stock, taxes, fiscal prices | Money | Link menu products to stock items; explicit price publication contract, never competing editable values |
| Sales, purchases, supplier balances, treasury, shifts, journals | Money after per-brand activation | Branda UI calls a versioned accounting adapter; one posting destination |
| Loyalty memberships, cards, rewards | Branda | Consume committed/refunded sale events once; independent customer consent/identity |
| Invoice attachments | Money private object storage | Authorized short-lived downloads; financial metadata only in DB |

IDs must map by immutable source IDs, not names, phone numbers or equality of independent UUIDs. A stock-only item must not be published into the menu implicitly. Clinical data and permissions are outside this connector.

## Entry and authorization

Retain Branda UI and brand styling. Both owner dashboard entry and cashier login reach the same accounting adapter with distinct real actors. Money validates tenant, branch, terminal and action on every request. Use a supported identity federation protocol (OIDC authorization code with PKCE if the chosen issuer is enabled) or a reviewed backend session exchange, never transferable passwords, arbitrary user IDs, shared service keys in browsers or a redirect alone. Explicit role mapping and audience validation are required; owner access does not imply Money clinical permissions. Admin maintenance requires signed, short-lived tenant-specific impersonation and a separately audited privileged endpoint.

## Fast data and reliable delivery

- Versioned local catalog projection in Money; no cross-database joins or Branda request per product click
- Cashier downloads permitted catalog, price/tax version and own open shift at startup; selection/totals execute locally
- Delta feeds and background prefetch, compact indexed reads, cached read-only summaries with freshness timestamp; balances used to authorize posting remain transactionally authoritative
- Transactional outbox + authenticated inbox + unique event/request IDs; retain failed deliveries with backoff and reconciliation
- Same hosting region where feasible; test real PostgreSQL concurrent terminals and p95 latency before promising timing
- Current Money tenant-row serialization is safe but can limit throughput; narrow locks only after measured contention and correctness tests

## Offline POS scope

Implement a dedicated POS-only local store, separate from Money clinical/auth storage. Cache permitted catalog/images/receipt assets and preserve pending sale commands in IndexedDB. No passwords or service tokens. Bind every command to user, brand, terminal and open shift; use a server-issued bounded offline authorization lease and clear separation between local provisional receipt and server-issued fiscal number. Preserve original recorded time and price/tax version. Retry the identical idempotency key after uncertain responses; reauthorize on sync. Revocation cannot be observed while disconnected, so define bounded offline admission and explicit reconciliation rather than claiming immediate offline revocation.

Prevent closing/handover/reset while this terminal has unsynced operations. Multiple devices can still conflict: server validates stock, shift and price versions; conflicts stay visible and preserved for authorized resolution, never silently dropped or overwritten. Require a signed-in prepared terminal before going offline; fresh login needs connectivity. Bank/POS payment recording does not make an external payment terminal process payments offline.

## Local implementation sequence

1. Confirm Money as accounting authority and define versioned adapter contracts, ID mappings and permission matrix
2. Isolated Money tenant/DB fixtures, local SSO/session exchange and menu delta projection; preserve both current previews and live data
3. Adapt Branda POS and finance UI to Money sale/purchase/shift commands without copying a second ledger; align existing workflow differences explicitly
4. Add offline persistence/print/sync and test reconnect, timeout-after-commit, two tabs, revoked user, shift closed elsewhere, pricing and stock conflicts
5. One-brand migration rehearsal: reconcile balances/history, choose cutover timestamp and freeze old financial writes; retain old records read-only and route each transaction to exactly one engine
6. Publish only after explicit user release authorization; verify exact app versions and production DB/config independently

## Pending current local changes

Branda shift drafts add opening balances, cash discrepancies, supplier documents/purchases, reports, private attachment metadata and WhatsApp outbox. Type checks and focused agent tests are local evidence only; no hosted migration or storage bucket exists from this task. Admin document reversal/delete flow, offline POS and the Money connector remain unimplemented. Reuse the UI/domain tests when moving ownership, but do not apply duplicate accounting schema merely to finish the old approach.
