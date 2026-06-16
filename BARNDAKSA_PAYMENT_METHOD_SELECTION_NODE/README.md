# BARNDAKSA_PAYMENT_METHOD_SELECTION_NODE

Node-only patch. No PowerShell scripts.

Run from project root:

```bash
node BARNDAKSA_PAYMENT_METHOD_SELECTION_NODE/apply.cjs
npm run build
npm run dev
```

Changes:
- Shows separate payment choices:
  - Mada / Visa / Mastercard
  - Apple Pay
  - PayPal
- Sends selected Paymob method to create-intention route.
- Uses Paymob hosted checkout now.
- Removes paid enum usage from subscription data filter.
- Hides pending subscriptions from history results.
