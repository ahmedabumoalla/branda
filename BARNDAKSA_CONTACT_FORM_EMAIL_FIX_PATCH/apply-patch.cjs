const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PATCH_NAME = 'BARNDAKSA_CONTACT_FORM_EMAIL_FIX_PATCH';
const BACKUP_DIR = path.join(ROOT, `.barndaksa-backups/${PATCH_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function filePath(rel) {
  return path.join(ROOT, rel);
}

function ensureDir(rel) {
  fs.mkdirSync(path.dirname(filePath(rel)), { recursive: true });
}

function read(rel) {
  const p = filePath(rel);
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${rel}`);
  return fs.readFileSync(p, 'utf8');
}

function backup(rel, content) {
  const dest = path.join(BACKUP_DIR, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function write(rel, content) {
  const p = filePath(rel);
  const before = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (before === content) return false;
  if (before !== null) backup(rel, before);
  ensureDir(rel);
  fs.writeFileSync(p, content, 'utf8');
  return true;
}

function patchPlatformContentAction() {
  const rel = 'app/actions/platform-content.ts';
  let content = read(rel);
  const before = content;

  if (content.includes('import { createClient } from "@/lib/supabase/server";')) {
    content = content.replace(
      'import { createClient } from "@/lib/supabase/server";',
      'import { createAdminClient } from "@/lib/supabase/admin";'
    );
  } else if (!content.includes('import { createAdminClient } from "@/lib/supabase/admin";')) {
    const anchor = 'import { escapeEmailHtml, isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";';
    if (!content.includes(anchor)) throw new Error(`لم أجد موضع إضافة createAdminClient في ${rel}`);
    content = content.replace(anchor, `${anchor}\nimport { createAdminClient } from "@/lib/supabase/admin";`);
  }

  const helperMarker = 'const CONTACT_NOTIFY_EMAIL_FALLBACK = "cto.branda@gmail.com";';
  if (!content.includes(helperMarker)) {
    const anchor = 'import { escapeEmailHtml, isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";';
    if (!content.includes(anchor)) throw new Error(`لم أجد موضع إضافة إعداد بريد التواصل في ${rel}`);
    const helper = `\n\nconst CONTACT_NOTIFY_EMAIL_FALLBACK = "cto.branda@gmail.com";\n\nfunction getContactNotifyEmail() {\n  return (\n    process.env.BARNDAKSA_CONTACT_NOTIFY_EMAIL?.trim() ||\n    process.env.RESEND_REPLY_TO?.trim() ||\n    CONTACT_NOTIFY_EMAIL_FALLBACK\n  );\n}\n\nfunction normalizeContactRequestInput(input: { fullName: string; email: string; message: string }) {\n  const fullName = String(input.fullName ?? "").trim();\n  const email = String(input.email ?? "").trim().toLowerCase();\n  const message = String(input.message ?? "").trim();\n\n  if (fullName.length < 2 || fullName.length > 120) {\n    throw new Error("اكتب الاسم بشكل صحيح");\n  }\n  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {\n    throw new Error("اكتب البريد الإلكتروني بشكل صحيح");\n  }\n  if (message.length < 5 || message.length > 2000) {\n    throw new Error("اكتب رسالة بين 5 و 2000 حرف");\n  }\n\n  return { fullName, email, message };\n}\n`;
    content = content.replace(anchor, `${anchor}${helper}`);
  }

  const start = content.indexOf('export async function submitContactRequestAction(input:');
  const end = content.indexOf('export async function recordIntroVideoEventAction', start);
  if (start === -1 || end === -1) {
    throw new Error(`لم أجد submitContactRequestAction كاملة في ${rel}`);
  }

  const newFunction = `export async function submitContactRequestAction(input: {\n  fullName: string;\n  email: string;\n  message: string;\n}) {\n  const parsed = normalizeContactRequestInput(input);\n  const admin = createAdminClient();\n\n  const { error } = await admin.from("platform_contact_requests").insert({\n    full_name: parsed.fullName,\n    email: parsed.email,\n    message: parsed.message,\n    status: "new",\n  });\n\n  if (error) {\n    console.error("[submitContactRequestAction:insert]", error);\n    throw new Error(\`تعذر إرسال طلب التواصل: \${error.message}\`);\n  }\n\n  revalidatePath("/admin/content");\n\n  if (isBarndaksaEmailConfigured()) {\n    const to = getContactNotifyEmail();\n    await sendBarndaksaEmail({\n      to,\n      replyTo: parsed.email,\n      subject: \`طلب تواصل جديد من \${parsed.fullName}\`,\n      html: \`\n        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#241610">\n          <h2>طلب تواصل جديد من منصة بارنداكسا</h2>\n          <p><strong>الاسم:</strong> \${escapeEmailHtml(parsed.fullName)}</p>\n          <p><strong>البريد:</strong> \${escapeEmailHtml(parsed.email)}</p>\n          <p><strong>الرسالة:</strong></p>\n          <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:12px;background:#fcf8f3">\${escapeEmailHtml(parsed.message)}</div>\n          <p style="margin-top:16px;color:#806A5E">تظهر هذه الرسالة أيضًا في لوحة الأدمن: إدارة محتوى المنصة ← طلبات التواصل الواردة.</p>\n        </div>\n      \`,\n      text: \`طلب تواصل جديد\\nالاسم: \${parsed.fullName}\\nالبريد: \${parsed.email}\\nالرسالة: \${parsed.message}\\n\\nتظهر الرسالة في لوحة الأدمن: إدارة محتوى المنصة ← طلبات التواصل الواردة.\`,\n    }).catch((mailError) => {\n      console.error("[submitContactRequestAction:email]", mailError);\n    });\n  } else {\n    console.warn("[submitContactRequestAction:email] Resend is not configured; saved contact request without email notification.");\n  }\n}\n\n`;

  content = content.slice(0, start) + newFunction + content.slice(end);

  return write(rel, content);
}

function patchPlatformHomePageClient() {
  const rel = 'components/marketing/platform-home-page.tsx';
  let content = read(rel);
  const before = content;

  const oldState = '  const [state, setState] = useState<"idle" | "saving" | "done">("idle");';
  const newState = '  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");\n  const [submitError, setSubmitError] = useState("");';
  if (content.includes(oldState)) {
    content = content.replace(oldState, newState);
  } else if (!content.includes('const [submitError, setSubmitError] = useState(""')) {
    throw new Error(`لم أجد حالة نموذج التواصل في ${rel}`);
  }

  const oldSubmit = `  async function submit(event: FormEvent) {\n    event.preventDefault();\n    setState("saving");\n    await submitContactRequestAction({ fullName, email, message });\n    setState("done");\n  }`;
  const newSubmit = `  async function submit(event: FormEvent) {\n    event.preventDefault();\n    setState("saving");\n    setSubmitError("");\n    try {\n      await submitContactRequestAction({ fullName, email, message });\n      setState("done");\n      setFullName("");\n      setEmail("");\n      setMessage("");\n    } catch (error) {\n      setSubmitError(error instanceof Error ? error.message : "تعذر إرسال الرسالة، حاول مرة أخرى");\n      setState("error");\n    }\n  }`;
  if (content.includes(oldSubmit)) {
    content = content.replace(oldSubmit, newSubmit);
  } else if (!content.includes('setSubmitError(error instanceof Error')) {
    throw new Error(`لم أجد دالة إرسال نموذج التواصل في ${rel}`);
  }

  if (!content.includes('state === "error" && submitError')) {
    const ternaryFormStart = `        ) : (\n          <form onSubmit={submit} className="mt-5 space-y-3">`;
    const ternaryFormStartReplacement = `        ) : (\n          <>\n            {state === "error" && submitError ? (\n              <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">\n                {submitError}\n              </p>\n            ) : null}\n            <form onSubmit={submit} className="mt-5 space-y-3">`;
    if (!content.includes(ternaryFormStart)) {
      throw new Error(`لم أجد بداية نموذج التواصل لإضافة رسالة الخطأ في ${rel}`);
    }
    content = content.replace(ternaryFormStart, ternaryFormStartReplacement);

    const formEnd = `          </form>\n        )}`;
    const formEndReplacement = `            </form>\n          </>\n        )}`;
    if (!content.includes(formEnd)) {
      throw new Error(`لم أجد نهاية نموذج التواصل لإضافة رسالة الخطأ في ${rel}`);
    }
    content = content.replace(formEnd, formEndReplacement);
  }

  return write(rel, content);
}

function patchAdminContentPage() {
  const rel = 'components/admin/pages/admin-content-page.tsx';
  let content = read(rel);
  const before = content;

  const oldHeader = `<div className="mb-5 flex items-center gap-3">\n          <ContactRound className="h-7 w-7 text-[#F6C35B]" />\n          <h2 className="text-xl font-black text-[#F8F4EF]">طلبات التواصل الواردة</h2>\n        </div>`;
  const newHeader = `<div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">\n          <div className="flex items-center gap-3">\n            <ContactRound className="h-7 w-7 text-[#F6C35B]" />\n            <div>\n              <h2 className="text-xl font-black text-[#F8F4EF]">طلبات التواصل الواردة</h2>\n              <p className="mt-1 text-xs font-bold text-[#CBB29C]">هذه هي رسائل قسم تواصل معنا في الصفحة الرئيسية، ويتم إرسال نسخة إلى cto.branda@gmail.com عند توفر إعدادات Resend.</p>\n            </div>\n          </div>\n          <StatusBadge tone="gold">المسار: الأدمن ← إدارة محتوى المنصة</StatusBadge>\n        </div>`;

  if (content.includes(oldHeader)) {
    content = content.replace(oldHeader, newHeader);
  }

  return write(rel, content);
}

function patchAdminSidebarLabel() {
  const rel = 'components/admin/AdminSidebar.tsx';
  let content = read(rel);
  const before = content;

  if (content.includes('["إدارة محتوى المنصة", "/admin/content", Megaphone]')) {
    content = content.replace(
      '["إدارة محتوى المنصة", "/admin/content", Megaphone]',
      '["المحتوى ورسائل التواصل", "/admin/content", Megaphone]'
    );
  }

  return write(rel, content);
}

function writeSqlMigration() {
  const rel = 'supabase/migrations/042_barndaksa_contact_requests_citext_rpc_fix.sql';
  const content = `-- Barndaksa — contact form production fix\n-- Fixes submit_platform_contact_request when SECURITY DEFINER uses an empty search_path\n-- and keeps the public contact RPC safe for future use.\n\nbegin;\n\ncreate extension if not exists citext with schema public;\n\ncreate or replace function public.submit_platform_contact_request(\n  p_full_name text,\n  p_email text,\n  p_message text\n)\nreturns uuid\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp\nas $$\ndeclare\n  v_id uuid;\n  v_full_name text := btrim(coalesce(p_full_name, ''));\n  v_email text := lower(btrim(coalesce(p_email, '')));\n  v_message text := btrim(coalesce(p_message, ''));\nbegin\n  if char_length(v_full_name) < 2 or char_length(v_full_name) > 120 then\n    raise exception 'Invalid full name';\n  end if;\n\n  if v_email !~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' then\n    raise exception 'Invalid email';\n  end if;\n\n  if char_length(v_message) < 5 or char_length(v_message) > 2000 then\n    raise exception 'Invalid message';\n  end if;\n\n  insert into public.platform_contact_requests(full_name, email, message, status)\n  values (v_full_name, v_email, v_message, 'new')\n  returning id into v_id;\n\n  return v_id;\nend;\n$$;\n\nrevoke all on function public.submit_platform_contact_request(text, text, text) from public;\ngrant execute on function public.submit_platform_contact_request(text, text, text) to anon, authenticated;\n\ncommit;\n`;
  return write(rel, content);
}

function main() {
  if (!fs.existsSync(filePath('package.json'))) {
    throw new Error('شغل السكربت من جذر المشروع الذي يحتوي package.json');
  }

  const changed = [];
  if (patchPlatformContentAction()) changed.push('app/actions/platform-content.ts');
  if (patchPlatformHomePageClient()) changed.push('components/marketing/platform-home-page.tsx');
  if (patchAdminContentPage()) changed.push('components/admin/pages/admin-content-page.tsx');
  if (patchAdminSidebarLabel()) changed.push('components/admin/AdminSidebar.tsx');
  if (writeSqlMigration()) changed.push('supabase/migrations/042_barndaksa_contact_requests_citext_rpc_fix.sql');

  console.log(`✅ ${PATCH_NAME} applied successfully`);
  console.log(`📦 Backup: ${BACKUP_DIR}`);
  console.log(changed.length ? `🛠️ Changed files:\n- ${changed.join('\n- ')}` : 'No changes needed.');
  console.log('\nرسائل قسم تواصل معنا تظهر في: لوحة الأدمن > المحتوى ورسائل التواصل > طلبات التواصل الواردة');
  console.log('وسيتم إرسال نسخة بريدية إلى: BARNDAKSA_CONTACT_NOTIFY_EMAIL أو RESEND_REPLY_TO أو cto.branda@gmail.com');
  console.log('\nNext commands:');
  console.log('npm exec tsc -- --noEmit');
  console.log('npm run build');
}

try {
  main();
} catch (error) {
  console.error('❌ Patch failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
