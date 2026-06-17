# BARNDAKSA_CAFE_LOGO_FINAL_FIX_PATCH

يشغّل من جذر المشروع:

```bash
node BARNDAKSA_CAFE_LOGO_FINAL_FIX_PATCH/apply-patch.cjs
```

ثم:

```bash
npm exec tsc -- --noEmit
npm run build
```

هذا الباتش يستبدل ملف `lib/cafe/use-resolved-cafe-logo.ts` كاملًا ويزيل سبب خطأ TypeScript:

```text
Property 'includes' does not exist on type 'never'
```

لا يوجد تعديل على قاعدة البيانات.
