# Butcher business category

Adds the available activity label «ملحمة» with the internal ID `butcher_shops` to administrator account creation and the public contact form. Existing category selection is preserved. New butcher accounts use the approved signature menu, product terminology and stamp-based loyalty labels, with menu/orders/loyalty/rewards/cashier capabilities

Server input validation uses the shared category registry. Migration `20261106212401_enable_butcher_shops_category.sql` extends the two category constraints and the service-only account preparation allowlist, preserving authorization, RLS, trial-plan fallback and all business rows. It is guarded against unexpected schema changes and uses a short lock timeout. No real business account was created and no message was sent

Verification: 9 category boundary groups, the existing salon/gift checks and 51 SQL checks passed. Live rollback, application and independent readback passed, including unchanged business-data fingerprints and service-only RPC grants. Migration MD5: `422db48286d5efd10c8191e8d0462873`, resulting function MD5: `ab4a6fb664f8c0a3f550eba41b7ce817`

Release evidence is recorded under `output/butcher-category`: scoped source/test/config/dependency fingerprints, text integrity, TypeScript, lint baseline, production build and publication checks. The customer fast-app file has an existing effect lint error and three warnings, and the existing salon check has seven CommonJS lint errors; comparison against the published parent confirms no new diagnostics

Local continuity: port 3016 was briefly stopped during preparation and restored after the user reported the interruption. Further build work runs in the independent `C:/Projects/branda-local-runtime-20261107` directory so the running local server stays available during release preparation

No browser inspection or real account creation was performed. The administrator form was rendered in focused tests and persistence was verified through the guarded database checks. Public signup keeps its existing account-type behavior
