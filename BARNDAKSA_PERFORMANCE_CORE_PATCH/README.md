# BARNDAKSA PERFORMANCE CORE PATCH

شغّل من جذر المشروع:

```bash
node BARNDAKSA_PERFORMANCE_CORE_PATCH/apply-patch.cjs
```

ثم شغّل ملف قاعدة البيانات الذي سيُكتب في جذر المشروع:

```text
BARNDAKSA_PERFORMANCE_DB_FAST_PATH.sql
```

داخل Supabase SQL Editor مرة واحدة.

بعدها:

```bash
npm exec tsc -- --noEmit
npm run build
```
