# New-account loyalty defaults and LA GIOIA identity

User requested publication on 2026-11-18. New brands with loyalty entitlement now receive an enabled loyalty program and Apple/Google Wallet flags during onboarding, without a first manual save. Subscription authorization remains mandatory; existing accounts and explicit disabled settings are preserved. Deferred initialization runs after onboarding creates the subscription, including both verified self-signup and administrator creation.

Migration `20261118100913_new_brand_loyalty_wallet_defaults.sql` applied at 10:11:51Z. Actual database rollback checks before and after application verified initialization after subscription creation, retained explicit opt-outs and existing programs, and denied direct anonymous/authenticated trigger execution. No test account retained. The immediate-trigger prototype failed the service guard and was rolled back before the corrected version was applied.

LA GIOIA now uses the owner's provided logo asset and its original muted green, with light readable text. Reward and required visits were not changed. Logo extraction retains dark brand colors for future uploads. Generic compact cards balance stamp rows and isolate the numerical counter from RTL flow; existing special Fawasel/Kawakib compositions remain.

Validation: full TypeScript, 45 automatic logo/identity checks, approved-card rendering/palette/wallet behavior suite. The latter had an obsolete assertion expecting recolored logos; updated to the already deployed original-logo behavior. Text integrity and exact production deployment are recorded in the current task state after completion. No credentials or real test messages were used in these changes.
