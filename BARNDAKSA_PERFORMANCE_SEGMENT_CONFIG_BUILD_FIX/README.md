# BARNDAKSA_PERFORMANCE_SEGMENT_CONFIG_BUILD_FIX

يشيل segment config غير المقبولة من ملفات route العامة بعد باتش الأداء.

التشغيل من جذر المشروع:

```bash
node BARNDAKSA_PERFORMANCE_SEGMENT_CONFIG_BUILD_FIX/apply-patch.cjs
npm exec tsc -- --noEmit
npm run build
```
