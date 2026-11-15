# MIND customers and performance - 2026-11-15

## Implementation

MIND customer management has two existing-design cards: branch customers with issued sales invoices (all authorized history) and the original loyalty-card customer registry. Removed only the requested MIND menu entries and duplicate loyalty registry entry; non-MIND brands retain their navigation. Old MIND loyalty customers URL redirects to the new location

Read-only database projection preserves original role, employee, maintenance, branch and field-masking guards. No customer data or balances changed. Migration20261115183734 applied and real-owner membership/anonymous/cross-tenant/ACL assertions passed inside the same transaction, sourceMD5 f1a309f98d6d44a5e10f6f7f00e36466

MIND expanded navigation prepares a maximum of3 relevant routes; customer cards prepare both destinations. Finance metadata reads run concurrently; MIND ERP data avoids waiting for unrelated menu image signatures. Payment data reuse is bounded to30seconds and one authorized snapshot, with in-flight deduplication and invalidation after saving/refresh/branch or account changes

Admin brands initially reads brands, plans and deletion state only. Details/activity components are deferred; selected brand's latest8 customers/orders load with server admin authorization and page-scoped60second reuse

## Verification and publication

- Node24 TypeScript and scoped text integrity/diff review required; final results/input hashes in private .codex-tmp/mind-speed-verification.json
- DB evidence: output/erp-database/mind-directory-apply.result.json. Direct table read42501 replaced with guarded RPC; initial apply syntax attempt rolled back before successful corrected application
- User performs behavioral testing. No browser, real payment/refund/message or controlled before/after production timing measured
- Release is prepared from current origin/main7635795b, preserving Claude's enterprise and birthday changes. GitHub/Vercel publication pending exact deployment verification
- Native Wallet location once/day remains unresolved and is outside this change; no silent disabling or false daily limiter
