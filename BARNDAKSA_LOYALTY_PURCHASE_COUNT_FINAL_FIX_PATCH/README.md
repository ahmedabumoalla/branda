# BARNDAKSA_LOYALTY_PURCHASE_COUNT_FINAL_FIX_PATCH

هذا الباتش يعالج مشكلة: QR بطاقة الولاء يقرأ من صفحة الكاشير لكن عند احتساب عملية الشراء يظهر: تعذر احتساب عملية الشراء من بطاقة الولاء.

## الملفات التي يلمسها الباتش
- lib/loyalty/secure-qr-payload.ts
- components/loyalty/barcode-camera-scanner.tsx
- components/cashier/cashier-console-client.tsx
- components/dashboard/pages/loyalty-cards-page.tsx
- lib/data/cashier.ts
- lib/data/loyalty-cards.ts
- app/actions/cashier.ts إذا كان موجودًا
- app/actions/loyalty-cards.ts إذا كان موجودًا

## التطبيق
ضع المجلد في جذر المشروع ثم شغل:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_LOYALTY_PURCHASE_COUNT_FINAL_FIX_PATCH\APPLY_LOYALTY_PURCHASE_COUNT_FINAL_FIX.ps1" -ProjectPath "E:\branda-platform"
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
npm run build
npm run dev
```

## مهم جدًا
انسخ محتوى الملف التالي وشغله في Supabase SQL Editor:

```text
BARNDAKSA_LOYALTY_PURCHASE_COUNT_FINAL_FIX_PATCH\sql\016_barndaksa_loyalty_purchase_count_final_fix.sql
```

بدون تشغيل SQL قد يستمر فشل الاحتساب لأن المشكلة قد تكون في دالة قاعدة البيانات أو قيود سجل الكاشير.
