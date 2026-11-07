# Butcher products and offline cashier

Implemented and verified 2026-11-07 Riyadh

- Butcher product entry requires meat type and independently priced units: kilogram, gram, carcass, half, quarter or custom. Origin is optional; legacy products remain readable. Unit prices retain six decimal places
- Financial POS selects a unit and fractional quantity, pins the reviewed price and requires explicit acceptance if the catalog price changes
- Butcher sales need neither a phone nor an open shift. Server and SQL suppress customer receipt messages, loyalty and pager effects even for crafted payloads. Voluntary shifts retain custody and administrative pause checks. Other business categories keep their shift and customer workflows
- Existing durable IndexedDB receipts retain the selected measure and precise price, survive offline reload and synchronize automatically on reconnection without duplicate posting. Conflicts remain visible without silent repricing or re-collection
- Stock conversion supports kilogram/gram and carcass/half/quarter families. No carcass weight is invented. A tracked product's base unit cannot be changed until its stock link is removed. Refunds retain the original measure

## Verification

Node 24.19.0: product48, POS13 groups, SQL158 (112 legacy plus46 butcher), customer UI8, service boundaries, offline queue, service worker8, receipts, scoped lint, text integrity, TypeScript and isolated production build passed

Actual isolated Chromium test:250grams at0.075 produced18.75, saved while offline without a shift/phone, survived a reload and synchronized one receipt automatically on reconnect. The390px unit chooser had no page overflow. Test APIs were intercepted by an isolated local fixture; no real sale or customer message was committed

Live database rollback verified a synthetic gram sale/replay, exact price, balanced journal and zero customer effects inside the existing butcher owner context. The migration was then applied with seven business table contents preserved and unchanged existing RLS/grants. Exact migration MD5 readback: `ed6b2512f9489cd9ab17dc0ceabd7e40`

Evidence: root `output/butcher-pos/{root-merge-checks,browser-verification,live-sale-rollback,applied,verified-schema,final-checks,publication}.json`; release `output/butcher-pos/backend-db-checks.json`

## Runtime and use

Updated isolated runtime: `C:/Projects/branda-local-runtime-20261107-butcher-pos`, `http://localhost:3018`, PID2012. Previous3017/PID22140 remains running. Do not build over either running runtime or replace their linked dependencies

Open the cashier once while online to prepare this device. Keep its browser storage; pending receipts are stored there. Reconnect with the same cashier account to synchronize; expired/revoked authorization requires sign-in before synchronization. Shift open/close and administrative changes still require a connection

The original workspace retains its unrelated edits and additional finance setup features. Only this task's reviewed release delta is published. Exact GitHub main/Vercel identity is recorded in publication evidence after deployment
