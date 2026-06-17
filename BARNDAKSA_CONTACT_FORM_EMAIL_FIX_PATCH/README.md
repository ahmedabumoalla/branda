# BARNDAKSA_CONTACT_FORM_EMAIL_FIX_PATCH

إصلاح قسم **تواصل معنا** في الصفحة الرئيسية.

## ماذا يصلح؟

- يلغي اعتماد إرسال رسالة التواصل على RPC القديم الذي كان يسبب خطأ: `type "citext" does not exist`.
- يحفظ الرسائل مباشرة في جدول `platform_contact_requests` من السيرفر.
- يرسل نسخة بريدية إلى:
  1. `BARNDAKSA_CONTACT_NOTIFY_EMAIL` إن وجد
  2. أو `RESEND_REPLY_TO` إن وجد
  3. أو `cto.branda@gmail.com` كافتراضي
- يوضح مكان استقبال الرسائل في لوحة الأدمن.
- يضيف migration اختياري لإصلاح RPC القديم في قاعدة البيانات مستقبلًا.

## التشغيل

من جذر المشروع:

```bash
node BARNDAKSA_CONTACT_FORM_EMAIL_FIX_PATCH/apply-patch.cjs
npm exec tsc -- --noEmit
npm run build
```

## مكان استقبال رسائل تواصل معنا

لوحة الأدمن ← المحتوى ورسائل التواصل ← طلبات التواصل الواردة

> ملاحظة: إرسال البريد يحتاج أن تكون إعدادات Resend موجودة وصحيحة في Vercel/البيئة.
