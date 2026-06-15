# BARNDAKSA Server Action Upload Limit Patch

This patch updates `next.config.*` only.

It sets:

```ts
serverActions: {
  bodySizeLimit: "50mb",
}
```

Run from project root:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_SERVER_ACTION_UPLOAD_LIMIT_PATCH\APPLY_SERVER_ACTION_UPLOAD_LIMIT.ps1" -ProjectPath "E:\branda-platform"
npm run build
npm run dev
```

If files larger than 50MB are needed later, the upload flow should be changed to direct Supabase Storage upload instead of Server Actions.
