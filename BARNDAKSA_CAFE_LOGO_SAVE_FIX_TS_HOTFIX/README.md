# BARNDAKSA_CAFE_LOGO_SAVE_FIX_TS_HOTFIX

يشغل من جذر المشروع:

```bash
node BARNDAKSA_CAFE_LOGO_SAVE_FIX_TS_HOTFIX/apply-patch.cjs
```

بعدها:

```bash
npm exec tsc -- --noEmit
npm run build
```

## ماذا يصلح؟
- إصلاح خطأ TypeScript: `Property 'includes' does not exist on type 'never'`.
- الإبقاء على حل شعار الكوفي بعد الحفظ كما هو.
- لا يوجد تعديل على قاعدة البيانات.
