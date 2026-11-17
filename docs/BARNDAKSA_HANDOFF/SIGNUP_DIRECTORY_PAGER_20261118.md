# Signup choice, brand counts and finance-only pager

Published40ec61aa8618848b4b346ae1e7c8ffe4f358f75d, Verceldpl_BiyiGsySkNiUWyKSEyHdbCkqXaB6 READY; both aliases and registration choice HTML verified2026-11-17T23:24:36.287Z

- New self-registration: loyalty selects pro; loyalty and menu selects existing trial plan -; both preserve configured30-day free trial
- Missing choice in already-created verified drafts preserves the prior configured default; invalid choices fail closed
- Brand directory counts logical issued loyalty cards, lifetime registered stamps from total_purchases and nondeleted menu products, using one bounded aggregate call per100brands
- Pager requires active finance AND pager entitlement. Employee permission remains required; no automatic grants or package changes
- Existing verification proof, same-transaction deferred owner creation and account isolation retained

Validation:88PostgreSQL signup,25PostgreSQL admin aggregates,27feature-gating,46server/SSR registration,17directory CSS/SSR,18staff workspace checks; full release TypeScript and original scoped text passed
Migrations20261118000500/501 applied2026-11-17T23:16:17Z; live rollback verified2026-11-17T23:16:25Z with no fixtures retained
No actual provider messages or browser checks
Root worktree mirror aborted atomically due existing source divergence; authoritative published work is in isolated release
Detailed input hashes/commands: output/signup-directory-pager-20261118/checks.json

Fawasel branch identity work remains uncommitted and unapplied; not included in this publication
