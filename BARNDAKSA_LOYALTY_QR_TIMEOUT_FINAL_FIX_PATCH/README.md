# BARNDAKSA_LOYALTY_QR_TIMEOUT_FINAL_FIX_PATCH

Fixes Vercel TypeScript build error in:

`components/loyalty/barcode-camera-scanner.tsx`

Error:

`Type 'number' is not assignable to type 'Timeout'`

## Apply

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_LOYALTY_QR_TIMEOUT_FINAL_FIX_PATCH\APPLY_LOYALTY_QR_TIMEOUT_FINAL_FIX.ps1" -ProjectPath "E:\branda-platform"
npm run build
```

Then commit and push:

```powershell
git add components/loyalty/barcode-camera-scanner.tsx
git commit -m "Fix loyalty QR scanner timer type"
git push origin main
```
