# BARNDAKSA_FIX_CUSTOMER_LOGIN_MOJIBAKE_TEXT_PATCH

يصلح النصوص العربية المعطوبة في شاشة دخول/تسجيل عميل الفرع الإلكتروني.

الملف المستهدف فقط:

- `components/cafe/themes/themed-auth-panel.tsx`

طريقة التطبيق من جذر المشروع:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_FIX_CUSTOMER_LOGIN_MOJIBAKE_TEXT_PATCH\APPLY_FIX_CUSTOMER_LOGIN_MOJIBAKE_TEXT.ps1" -ProjectPath "E:\branda-platform"
Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue
npm run build
npm run dev
```
