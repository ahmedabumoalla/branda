# BARNDAKSA_LOGIN_RIGHT_PANEL_GHOST_LOGO_REMOVE_PATCH

يزيل اللوجو البني الشفاف الموجود في زاوية الكرت البني في صفحة `/login` فقط.

الملف المستهدف فقط:

```text
app/login/page.tsx
```

طريقة التطبيق:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_LOGIN_RIGHT_PANEL_GHOST_LOGO_REMOVE_PATCH\APPLY_LOGIN_RIGHT_PANEL_GHOST_LOGO_REMOVE.ps1" -ProjectPath "E:\branda-platform"
npm run build
npm run dev
```

السكريبت يعمل نسخة احتياطية تلقائيًا من الملف قبل التعديل.
