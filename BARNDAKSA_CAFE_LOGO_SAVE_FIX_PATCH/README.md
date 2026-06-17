# BARNDAKSA_CAFE_LOGO_SAVE_FIX_PATCH

يشغل من جذر المشروع:

```bash
node BARNDAKSA_CAFE_LOGO_SAVE_FIX_PATCH/apply-patch.cjs
```

بعدها:

```bash
npm exec tsc -- --noEmit
npm run build
```

## ماذا يصلح؟
- إصلاح عدم ظهور/ثبات شعار الكوفي بعد حفظه من إعدادات لوحة تحكم العلامة.
- حل المشكلة التي كانت تجعل مسار Supabase Storage يتعامل كأنه ID لصورة محلية داخل IndexedDB.
- تقليل خطأ Hydration في صفحة الإعدادات بسبب اختلاف رابط المعاينة بين localhost و barndaksa.com.

لا يوجد تعديل على قاعدة البيانات.
