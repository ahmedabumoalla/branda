# BARNDAKSA Server Action Upload Limit Patch V2

Place this folder in the project root, then run:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_SERVER_ACTION_UPLOAD_LIMIT_PATCH_V2\APPLY_SERVER_ACTION_UPLOAD_LIMIT_V2.ps1" -ProjectPath "E:\branda-platform"
npm run build
npm run dev
```

This patch only updates `next.config.*` to set Server Actions `bodySizeLimit` to `50mb`.
