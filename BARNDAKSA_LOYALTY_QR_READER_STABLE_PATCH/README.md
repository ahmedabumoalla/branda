# BARNDAKSA_LOYALTY_QR_READER_STABLE_PATCH

باتش محدود لقراءة QR بطاقة الولاء:

- يخلي QR بطاقة الولاء قصيرة بالكود نفسه بدل payload طويلة، عشان الكاميرا تقرأها بسرعة.
- يحافظ على QR الآمن لباقي الأنواع مثل المكافآت والحجوزات.
- يحسن قارئ الكاميرا باستخدام canvas scanning بدل الاعتماد المباشر على الفيديو فقط.
- يدعم قراءة QR القديم الآمن وQR الجديد المختصر ورابط بطاقة الولاء إن وجد.
- يضيف إدخال يدوي داخل نافذة القارئ كحل احتياطي.
- يلمس ملفين فقط:
  - `components/loyalty/secure-qr-code.tsx`
  - `components/loyalty/barcode-camera-scanner.tsx`

## التطبيق

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_LOYALTY_QR_READER_STABLE_PATCH\APPLY_LOYALTY_QR_READER_STABLE_PATCH.ps1" -ProjectPath "E:\branda-platform"
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
npm run build
npm run dev
```
