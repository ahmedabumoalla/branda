# BARNDAKSA Public Cafe Final Fix

This patch fixes public cafe loading by making public API data loaders use the server-side service role for public-safe filtered reads, removing unstable browser/Next force-cache for public cafe fetches, and keeping private tables closed to anon.

Apply:

```powershell
Expand-Archive .\BARNDAKSA_PUBLIC_CAFE_FINAL_FIX_PATCH.zip -DestinationPath .\BARNDAKSA_PUBLIC_CAFE_FINAL_FIX_PATCH -Force
.\BARNDAKSA_PUBLIC_CAFE_FINAL_FIX_PATCH\APPLY_BARNDAKSA_PUBLIC_CAFE_FIX.ps1 -ProjectPath "E:\branda-platform"
cd E:\branda-platform
npm run build
npm run dev
```

Then open:

- http://localhost:3000/api/public/cafe/test-cafe
- http://localhost:3000/api/public/cafe/test-cafe/menu
- http://localhost:3000/c/test-cafe
