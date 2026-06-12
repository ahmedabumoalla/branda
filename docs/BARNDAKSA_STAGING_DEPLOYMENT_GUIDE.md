# Barndaksa — Staging Deployment Guide

> **تحذير:** هذا الدليل للبيئة **المحلية (Local)** ومشروع **Supabase Staging** فقط.  
> **لا تشغّل** `supabase db push` أو `db reset` على Production قبل مراجعة [`BARNDAKSA_STAGING_SECURITY_VALIDATION_REPORT.md`](./BARNDAKSA_STAGING_SECURITY_VALIDATION_REPORT.md).

---

## المتطلبات

| الأداة | الإصدار الموصى به | ملاحظات |
|--------|-------------------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | latest | مطلوب لـ `supabase start` |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | ≥ 2.20 | `npm i -g supabase` أو Scoop/Chocolatey |
| Node.js | 20+ | `npm run build` |
| Git | any | |

---

## 1. Local — أول تشغيل

```bash
# من جذر المشروع
cd e:/barndaksa-platform

# تشغيل حاويات Supabase المحلية (Postgres + Auth + Storage + Studio)
supabase start

# إعادة بناء DB من migrations + seed الاختبار (ليس Production seed)
supabase db reset

# التحقق من تطبيق migrations بالترتيب:
# 001 → 002 → 003 → 004
supabase migration list

# بناء التطبيق
npm run build

# اختبارات pgTAP (RLS + RPC)
supabase test db
```

### ماذا يفعل `supabase db reset`؟

1. يحذف قاعدة البيانات المحلية.
2. يطبّق **`supabase/migrations/*.sql`** بالترتيب الرقمي.
3. يشغّل **`supabase/seed/security_test_seed.sql`** (مفعّل في `supabase/config.toml`).
4. **لا** يستخدم `supabase/seed/development_seed.sql` تلقائيًا — ذلك للتعليقات اليدوية فقط.

### Studio المحلي

بعد `supabase start`:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

انسخ `anon key` و `service_role key` من مخرجات `supabase start` إلى `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>  # server only — never expose to browser
```

---

## 2. Local — دورة التطوير

```bash
# بعد تعديل migration
supabase db reset

# اختبار سريع
supabase test db

# بناء Next.js
npm run build
```

**لا** تشغّل ملفات SQL يدويًا من SQL Editor في كل مرة — اعتمد على migrations + `db reset`.

---

## 3. Staging — بدون Docker محلي (مسار بديل)

إذا Docker/CLI غير متوفرين محليًا، استخدم مشروع Staging **منفصل تمامًا**:

### 3.A إنشاء مشروع Staging

1. Dashboard → New project → **`barndaksa-staging-security`** (أو اسم واضح)
2. **لا** تنسخ Production keys أو بيانات عملاء
3. احفظ Project Ref + Database URL + anon/service keys

### 3.B تطبيق Migrations (بدون CLI)

من **SQL Editor** على Staging، بالترتيب:

```txt
supabase/migrations/001_barndaksa_production_schema.sql
supabase/migrations/002_barndaksa_storage_policies.sql
supabase/migrations/003_barndaksa_security_hardening.sql
supabase/migrations/004_barndaksa_critical_security_fixes.sql
```

ثم seed الاختبار فقط:

```txt
supabase/seed/security_test_seed.sql
```

### 3.C التحقق اليدوي

- [`BARNDAKSA_PRODUCTION_SECURITY_TEST_CHECKLIST.md`](./BARNDAKSA_PRODUCTION_SECURITY_TEST_CHECKLIST.md) §8 + §11
- Security Advisor + Performance Advisor
- سجّل النتائج في [`BARNDAKSA_STAGING_SECURITY_VALIDATION_REPORT.md`](./BARNDAKSA_STAGING_SECURITY_VALIDATION_REPORT.md)

---

## 4. Staging — بعد نجاح Local (CLI)

### 3.1 إنشاء مشروع Staging

1. [Supabase Dashboard](https://supabase.com/dashboard) → New project → **Staging** (مثلاً `barndaksa-staging`).
2. احفظ **Project Ref** (مثل `abcdefghijklmnop`).

### 3.2 ربط CLI بـ Staging

```bash
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>
```

> ⚠️ **تأكد** أن `--project-ref` يخص **Staging** وليس Production.

### 3.3 دفع Migrations

```bash
# يطبّق 001→004 على Staging فقط
supabase db push
```

**لا** تشغّل `supabase db reset` على Staging إلا إن كنت تقبل مسح البيانات.

### 3.4 Seed على Staging (اختياري للاختبار)

```bash
# يدويًا فقط — ليس Production
psql "$STAGING_DATABASE_URL" -f supabase/seed/security_test_seed.sql
```

### 3.5 متغيرات Staging في `.env.staging` (محلي) أو Vercel Preview

```env
NEXT_PUBLIC_SUPABASE_URL=https://<STAGING_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role>
```

---

## 4. Security Advisor (Staging فقط)

بعد `supabase db push` على Staging:

1. Dashboard → **Database** → **Security Advisor**
2. **Run checks** / Refresh
3. Dashboard → **Database** → **Performance Advisor**
4. أصلح: RLS disabled، mutable search_path، exposed policies
5. وثّق النتائج في [`BARNDAKSA_STAGING_SECURITY_VALIDATION_REPORT.md`](./BARNDAKSA_STAGING_SECURITY_VALIDATION_REPORT.md)

---

## 5. أوامر npm المساعدة

```bash
npm run db:reset    # supabase db reset
npm run db:test     # supabase test db
npm run db:push     # supabase db push (Staging linked)
```

---

## 6. قائمة تحقق قبل Production

- [ ] `supabase db reset` + `supabase test db` ✅ محليًا
- [ ] `npm run build` ✅
- [ ] Staging: migrations مطبّقة
- [ ] Staging: Security Advisor بدون critical
- [ ] Staging: checklist §8 + §11 في [`BARNDAKSA_PRODUCTION_SECURITY_TEST_CHECKLIST.md`](./BARNDAKSA_PRODUCTION_SECURITY_TEST_CHECKLIST.md)
- [ ] مراجعة [`BARNDAKSA_SECURITY_DEFINER_REVIEW.md`](./BARNDAKSA_SECURITY_DEFINER_REVIEW.md)
- [ ] **لم** يُستخدم `security_test_seed.sql` على Production

---

## 7. استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| `supabase: command not found` | ثبّت CLI: `npm i -g supabase` |
| Docker not running | شغّل Docker Desktop ثم `supabase start` |
| `supabase test db` fails pgTAP | تأكد `supabase start` يعمل؛ pgTAP يُثبت تلقائيًا |
| npm SSL `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | استخدم VPN/Proxy أو `npm config set strict-ssl false` (مؤقت) |
| migration فشل على Staging | `supabase migration repair` — لا تستخدم على Production دون خطة |
