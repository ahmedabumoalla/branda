# BARNDAKSA_LOGIN_CORNER_LOGO_REMOVE_PATCH

هذا الباتش يزيل الصورة/الشعار الظاهر في زاوية بطاقة صفحة تسجيل الدخول فقط.

الملف المستهدف فقط:
- `app/login/page.tsx`

طريقة التشغيل من جذر المشروع:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_LOGIN_CORNER_LOGO_REMOVE_PATCH\APPLY_LOGIN_CORNER_LOGO_REMOVE.ps1" -ProjectPath "E:\branda-platform"
npm run build
npm run dev
```

يتم إنشاء نسخة احتياطية تلقائيًا:
- `app/login/page.tsx.bak-before-remove-corner-logo`
