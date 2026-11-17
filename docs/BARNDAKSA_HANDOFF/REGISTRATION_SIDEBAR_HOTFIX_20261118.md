# Registration and sidebar hotfix

Published application 176d296fb0e3cfaf2c716e2001d39a91ac389620, Vercel dpl_7srdvxGsAMr7XKetgPMqLvtCaQV5, exact aliases and registration HTTP200 verified 2026-11-17T23:05:08.471Z

- Registration diagnostic: WhatsApp verified, no Auth account/profile existed; failure occurred because GoTrue inserts users before protected application metadata
- Owner-only deferred transaction guard reloads final metadata and preserves verified session, expiry, phone binding and single-use proof; no unverified owner can commit
- Existing customer and staged admin signup paths preserved
- Migration20261118000400 applied2026-11-17T22:57:33Z; live rollback registration with30-day trial passed22:58:30Z; fixture removed
- Trial sidebar exception removed; all plans show only effectively enabled services, including administrator disables
-82PostgreSQL checks,21focused entitlement checks, full release TypeScript and scoped original text passed
- Full older sidebar SSR harness was not used as success: stale CSS module loader fails; targeted entitlement coverage passed
- No real messages, retained test accounts, customer password change or browser inspection
- Actual customer retry succeeded at2026-11-17T23:01:12Z; live audit23:04:50Z confirms active owner/brand, successful login and30-day trial. A subsequent rollback probe with the same contact email was correctly rejected because the real customer had already registered

Evidence: output/registration-hotfix-20261118 and output/fawasel-branches-20261118/registration-{apply,verify}.json
Fawasel branch work remains separate, uncommitted and unapplied; canonical shared card/balance model required
