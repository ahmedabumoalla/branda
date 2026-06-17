# BARNDAKSA_ADMIN_BRAND_PLAN_CHANGE_PATCH

يشغل من جذر المشروع:

```bash
node BARNDAKSA_ADMIN_BRAND_PLAN_CHANGE_PATCH/apply-patch.cjs
```

ثم:

```bash
npm exec tsc -- --noEmit
npm run build
```

التعديل يضيف للأدمن إمكانية تغيير الباقة الحالية لأي علامة تجارية مباشرة من جدول العلامات ومن كرت التحكم ومن نافذة التفاصيل.
