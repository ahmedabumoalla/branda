# BARNDAKSA_LOGO_AND_BROWSER_ICON_PATCH

هذا الباتش يغيّر شعار برندة والأيقونات العامة، ويضبط صورة المتصفح.

## التغييرات

- استبدال شعارات `barndaksa` و `branda` داخل `public/brand`.
- إضافة:
  - `public/favicon.ico`
  - `public/apple-touch-icon.png`
  - `app/favicon.ico`
  - `app/icon.png`
  - `app/apple-icon.png`
- ضبط أيقونة المتصفح العامة بدل ظهور Vercel.
- ضبط صفحة الفرع الإلكتروني `/c/[slug]`:
  - إذا العلامة التجارية عندها شعار، يظهر كشعار المتصفح.
  - إذا ما عندها شعار، يظهر شعار برندة.
- ضبط `CafeLogo` بحيث إذا ما فيه شعار للعلامة يظهر شعار برندة بدل الرمز الافتراضي.

## طريقة التطبيق

انسخ مجلد `BARNDAKSA_LOGO_AND_BROWSER_ICON_PATCH` داخل جذر المشروع:

```text
E:\branda-platform
```

ثم شغل من جذر المشروع:

```bash
node BARNDAKSA_LOGO_AND_BROWSER_ICON_PATCH/apply-patch.cjs
```

بعدها:

```bash
npm exec tsc -- --noEmit
npm run build
```

لا يوجد تعديل على قاعدة البيانات.
