# BARNDAKSA_LOYALTY_CARD_SCAN_ONLY_PATCH

هذا الباتش يغيّر آلية الولاء فقط:
- الكاشير يقرأ QR بطاقة الولاء فقط بدون QR الفاتورة.
- لوحة العلامة التجارية تقرأ QR بطاقة الولاء فقط بدون QR الفاتورة.
- عند قراءة QR البطاقة يتم احتساب عملية شراء مباشرة وإضافة ختم/كوب للعميل.
- يقبل القارئ QR برندة الآمن أو كود البطاقة النصي اليدوي.
- لا يلمس قاعدة البيانات ولا التصاميم العامة.

طريقة التطبيق:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_LOYALTY_CARD_SCAN_ONLY_PATCH\APPLY_LOYALTY_CARD_SCAN_ONLY_PATCH.ps1" -ProjectPath "E:\branda-platform"
npm run build
npm run dev
```
