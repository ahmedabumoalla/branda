# BARNDAKSA_LOYALTY_QR_READER_TIMEOUT_TYPE_FIX_PATCH

Fixes Vercel TypeScript build error:

```txt
Type error: Type 'number' is not assignable to type 'Timeout'.
components/loyalty/barcode-camera-scanner.tsx
```

## Apply

Place this folder in the project root, then run:

```powershell
cd E:\branda-platform

powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_LOYALTY_QR_READER_TIMEOUT_TYPE_FIX_PATCH\APPLY_LOYALTY_QR_READER_TIMEOUT_TYPE_FIX.ps1" -ProjectPath "E:\branda-platform"

Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue

npm run build
npm run dev
```

## Touched file

```txt
components/loyalty/barcode-camera-scanner.tsx
```

This patch only changes the timer type to `number | null` because the scanner runs in the browser and uses `window.setTimeout`.
