# BARNDAKSA_RESERVATION_PRIMARY_BRANCH_FALLBACK_PATCH

يشغّل من جذر المشروع:

```bash
node BARNDAKSA_RESERVATION_PRIMARY_BRANCH_FALLBACK_PATCH/apply-patch.cjs
```

بعدها:

```bash
npm exec tsc -- --noEmit
npm run build
```

التعديل:
- صفحة حجز عميل العلامة تستخدم فروع الحجز الفعلية حتى لو خدمة الفروع ليست ضمن الباقة.
- إذا لا توجد فروع ظاهرة أو مسجلة، تعتمد تلقائيًا `الفرع الرئيسي`.
- زر Google Maps يظهر داخل خانة الفرع.
- لا يوجد تعديل قاعدة بيانات.
