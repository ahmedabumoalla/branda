# BARNDAKSA_PATCH_BACKUPS_TSC_EXCLUDE_FINAL_FIX

هذا الهوتفكس لا يغير منطق المنصة ولا قاعدة البيانات.

سبب الخطأ أن TypeScript صار يفحص مجلد النسخ الاحتياطية `BARNDAKSA_PATCH_BACKUPS` داخل المشروع، وفيه نسخة قديمة من ملف TSX قبل الإصلاح.

## التشغيل

من جذر المشروع:

```bash
node BARNDAKSA_PATCH_BACKUPS_TSC_EXCLUDE_FINAL_FIX/apply-patch.cjs
```

ثم:

```bash
npm exec tsc -- --noEmit
npm run build
```

## ماذا يفعل؟

- ينقل مجلد `BARNDAKSA_PATCH_BACKUPS` خارج المشروع إن وجد.
- يضيف استثناءات في `tsconfig.json` لمجلدات الباتش والنسخ الاحتياطية.
- لا يلمس قاعدة البيانات.
