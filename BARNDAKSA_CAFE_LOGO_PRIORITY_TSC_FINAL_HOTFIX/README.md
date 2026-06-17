# BARNDAKSA_CAFE_LOGO_PRIORITY_TSC_FINAL_HOTFIX

يشغل من جذر المشروع فقط:

```bash
node BARNDAKSA_CAFE_LOGO_PRIORITY_TSC_FINAL_HOTFIX/apply-patch.cjs
```

ثم:

```bash
npm exec tsc -- --noEmit
npm run build
```

هذا الباتش يقفل خطأ TypeScript:

```text
Cannot find name 'getPreferredCafeDisplayLogoUrl'
```

بدون تعديل قاعدة البيانات.
