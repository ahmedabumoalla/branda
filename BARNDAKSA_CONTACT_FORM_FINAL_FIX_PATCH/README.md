# BARNDAKSA_CONTACT_FORM_FINAL_FIX_PATCH

يشغل إصلاح تواصل معنا النهائي: الكود يرجع يستخدم RPC آمنة بدل direct insert، ويضيف ملف SQL لإصلاح قاعدة البيانات.

التشغيل من جذر المشروع:

```bash
node BARNDAKSA_CONTACT_FORM_FINAL_FIX_PATCH/apply-patch.cjs
```

بعدها شغل محتوى الملف الذي سيظهر في جذر المشروع:

```text
BARNDAKSA_CONTACT_REQUEST_DB_FIX.sql
```

داخل Supabase SQL Editor مرة واحدة.

ثم:

```bash
npm exec tsc -- --noEmit
npm run build
```
