# BARNDAKSA Paymob create-intention final fix

This patch replaces only:

app/api/payments/subscription/paymob/create-intention/route.ts

It removes the embedded Supabase relationship `subscriptions -> cafe_settings` and uses two separate queries.

Run:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_PAYMOB_CREATE_INTENTION_FINAL_FIX_PATCH\APPLY_PAYMOB_CREATE_INTENTION_FINAL.ps1" -ProjectPath "E:\branda-platform"
npm run build
npm run dev
```
