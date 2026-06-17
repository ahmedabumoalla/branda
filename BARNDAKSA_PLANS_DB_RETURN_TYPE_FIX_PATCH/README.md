# BARNDAKSA_PLANS_DB_RETURN_TYPE_FIX_PATCH

يشيل خطأ:

`cannot change return type of existing function`

## التشغيل

من جذر المشروع:

```bash
node BARNDAKSA_PLANS_DB_RETURN_TYPE_FIX_PATCH/apply-patch.cjs
```

ثم شغل الملف التالي كاملًا في Supabase SQL Editor:

```text
BARNDAKSA_PLANS_FEATURES_LOYALTY_REPS_DB_FINAL_FIXED.sql
```

لا تشغل ملف SQL القديم بعده.
