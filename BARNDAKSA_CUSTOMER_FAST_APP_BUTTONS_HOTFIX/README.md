# BARNDAKSA_CUSTOMER_FAST_APP_BUTTONS_HOTFIX

هذا تصحيح صغير يرجع أزرار العميل السريعة في واجهة `/app/[slug]`:

- المنتجات
- العروض والخصومات
- الحجوزات

ويضيف تبويب الحجوزات داخل التطبيق السريع مع كروت لخدمات الحجز المتاحة.

## طريقة التطبيق

انسخ مجلد `BARNDAKSA_CUSTOMER_FAST_APP_BUTTONS_HOTFIX` إلى جذر المشروع:

`E:\branda-platform`

ثم شغل:

```bash
node BARNDAKSA_CUSTOMER_FAST_APP_BUTTONS_HOTFIX/apply-patch.cjs
npm exec tsc -- --noEmit
npm run build
```

لا توجد تعديلات على قاعدة البيانات.
