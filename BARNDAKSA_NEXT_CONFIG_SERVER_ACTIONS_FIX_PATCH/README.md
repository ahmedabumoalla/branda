# Barndaksa Next Config Server Actions Fix

ضع هذا المجلد داخل جذر المشروع ثم شغل:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_NEXT_CONFIG_SERVER_ACTIONS_FIX_PATCH\APPLY_NEXT_CONFIG_SERVER_ACTIONS_FIX.ps1" -ProjectPath "E:\branda-platform"
npm run build
```

يصلح فقط `next.config.*` بإزالة `serverActions` من المستوى الأعلى ووضع `bodySizeLimit` داخل `experimental.serverActions`.
