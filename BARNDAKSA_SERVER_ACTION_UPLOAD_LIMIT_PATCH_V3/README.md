# BARNDAKSA_SERVER_ACTION_UPLOAD_LIMIT_PATCH_V3

يصلح خطأ Next Config الناتج عن وضع `serverActions` في المستوى الأعلى.

التعديل يلمس فقط ملف `next.config.*`:
- يحذف `serverActions` من أعلى `nextConfig`.
- يضيفها داخل `experimental.serverActions.bodySizeLimit = "50mb"`.

طريقة التطبيق من جذر المشروع:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_SERVER_ACTION_UPLOAD_LIMIT_PATCH_V3\APPLY_SERVER_ACTION_UPLOAD_LIMIT_V3.ps1" -ProjectPath "E:\branda-platform"
npm run build
```
