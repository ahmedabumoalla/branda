const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PATCH_NAME = "BARNDAKSA_CONTACT_FORM_FINAL_FIX_PATCH";
const BACKUP_DIR = path.join(ROOT, `.barndaksa-backups/${PATCH_NAME}-${new Date().toISOString().replace(/[:.]/g, "-")}`);

const SQL_CONTENT = "-- BARNDAKSA_CONTACT_FORM_FINAL_DB_FIX\n-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا لم تكن تستخدم supabase db push.\n-- الهدف: إرجاع نموذج تواصل معنا للعمل عبر RPC آمنة بدون خطأ citext وبدون permission denied.\n\nBEGIN;\n\nCREATE SCHEMA IF NOT EXISTS extensions;\nCREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;\n\nGRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;\nGRANT INSERT, SELECT, UPDATE ON TABLE public.platform_contact_requests TO service_role;\nGRANT SELECT ON TABLE public.platform_contact_requests TO authenticated;\n\nCREATE OR REPLACE FUNCTION public.submit_platform_contact_request(\n  p_full_name text,\n  p_email text,\n  p_message text\n)\nRETURNS uuid\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public, extensions, pg_temp\nAS $$\nDECLARE\n  v_id uuid;\n  v_full_name text;\n  v_email text;\n  v_message text;\nBEGIN\n  v_full_name := btrim(coalesce(p_full_name, ''));\n  v_email := lower(btrim(coalesce(p_email, '')));\n  v_message := btrim(coalesce(p_message, ''));\n\n  IF char_length(v_full_name) < 2 OR char_length(v_full_name) > 120 THEN\n    RAISE EXCEPTION 'Invalid full name';\n  END IF;\n\n  IF v_email !~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' THEN\n    RAISE EXCEPTION 'Invalid email';\n  END IF;\n\n  IF char_length(v_message) < 5 OR char_length(v_message) > 2000 THEN\n    RAISE EXCEPTION 'Invalid message';\n  END IF;\n\n  INSERT INTO public.platform_contact_requests(full_name, email, message, status)\n  VALUES (v_full_name, v_email, v_message, 'new')\n  RETURNING id INTO v_id;\n\n  RETURN v_id;\nEND;\n$$;\n\nREVOKE ALL ON FUNCTION public.submit_platform_contact_request(text, text, text) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.submit_platform_contact_request(text, text, text) TO anon, authenticated, service_role;\n\nCOMMIT;\n";
const NEW_FUNCTION = "export async function submitContactRequestAction(input: {\n  fullName: string;\n  email: string;\n  message: string;\n}) {\n  const parsed = normalizeContactRequestInput(input);\n  const admin = createAdminClient();\n\n  const { error } = await admin.rpc(\"submit_platform_contact_request\", {\n    p_full_name: parsed.fullName,\n    p_email: parsed.email,\n    p_message: parsed.message,\n  });\n\n  if (error) {\n    console.error(\"[submitContactRequestAction:rpc]\", error);\n    throw new Error(`تعذر إرسال طلب التواصل: ${error.message}`);\n  }\n\n  revalidatePath(\"/admin/content\");\n\n  if (isBarndaksaEmailConfigured()) {\n    const to = getContactNotifyEmail();\n    await sendBarndaksaEmail({\n      to,\n      replyTo: parsed.email,\n      subject: `طلب تواصل جديد من ${parsed.fullName}`,\n      html: `\n        <div dir=\"rtl\" style=\"font-family:Arial,sans-serif;line-height:1.8;color:#241610\">\n          <h2>طلب تواصل جديد من منصة بارنداكسا</h2>\n          <p><strong>الاسم:</strong> ${escapeEmailHtml(parsed.fullName)}</p>\n          <p><strong>البريد:</strong> ${escapeEmailHtml(parsed.email)}</p>\n          <p><strong>الرسالة:</strong></p>\n          <div style=\"white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:12px;background:#fcf8f3\">${escapeEmailHtml(parsed.message)}</div>\n          <p style=\"margin-top:16px;color:#806A5E\">تظهر هذه الرسالة أيضًا في لوحة الأدمن: إدارة محتوى المنصة ← طلبات التواصل الواردة.</p>\n        </div>\n      `,\n      text: `طلب تواصل جديد\\nالاسم: ${parsed.fullName}\\nالبريد: ${parsed.email}\\nالرسالة: ${parsed.message}\\n\\nتظهر الرسالة في لوحة الأدمن: إدارة محتوى المنصة ← طلبات التواصل الواردة.`,\n    }).catch((mailError) => {\n      console.error(\"[submitContactRequestAction:email]\", mailError);\n    });\n  } else {\n    console.warn(\"[submitContactRequestAction:email] Resend is not configured; saved contact request without email notification.\");\n  }\n}\n\n";
const HELPERS = "const CONTACT_NOTIFY_EMAIL_FALLBACK = \"cto.branda@gmail.com\";\n\nfunction getContactNotifyEmail() {\n  return (\n    process.env.BARNDAKSA_CONTACT_NOTIFY_EMAIL?.trim() ||\n    process.env.RESEND_REPLY_TO?.trim() ||\n    CONTACT_NOTIFY_EMAIL_FALLBACK\n  );\n}\n\nfunction normalizeContactRequestInput(input: { fullName: string; email: string; message: string }) {\n  const fullName = String(input.fullName ?? \"\").trim();\n  const email = String(input.email ?? \"\").trim().toLowerCase();\n  const message = String(input.message ?? \"\").trim();\n\n  if (fullName.length < 2 || fullName.length > 120) {\n    throw new Error(\"اكتب الاسم بشكل صحيح\");\n  }\n  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {\n    throw new Error(\"اكتب البريد الإلكتروني بشكل صحيح\");\n  }\n  if (message.length < 5 || message.length > 2000) {\n    throw new Error(\"اكتب رسالة بين 5 و 2000 حرف\");\n  }\n\n  return { fullName, email, message };\n}\n\n";

function filePath(rel) { return path.join(ROOT, rel); }
function ensureParent(rel) { fs.mkdirSync(path.dirname(filePath(rel)), { recursive: true }); }
function read(rel) {
  const p = filePath(rel);
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${rel}`);
  return fs.readFileSync(p, "utf8");
}
function backup(rel, content) {
  const dest = path.join(BACKUP_DIR, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, "utf8");
}
function write(rel, content) {
  const p = filePath(rel);
  const before = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  if (before === content) return false;
  if (before !== null) backup(rel, before);
  ensureParent(rel);
  fs.writeFileSync(p, content, "utf8");
  return true;
}
function findFunctionEnd(source, startIndex) {
  const braceStart = source.indexOf("{", startIndex);
  if (braceStart === -1) throw new Error("لم أجد بداية جسم submitContactRequestAction");
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("لم أجد نهاية submitContactRequestAction");
}
function ensureImport(content) {
  if (content.includes('import { createAdminClient } from "@/lib/supabase/admin";')) return content;
  if (content.includes('import { createClient } from "@/lib/supabase/server";')) {
    return content.replace('import { createClient } from "@/lib/supabase/server";', 'import { createAdminClient } from "@/lib/supabase/admin";');
  }
  const marker = 'import { uploadPlatformMedia, uploadSocialPostMedia } from "@/lib/storage/platform-content-upload";';
  if (content.includes(marker)) return content.replace(marker, `${marker}
import { createAdminClient } from "@/lib/supabase/admin";`);
  throw new Error("لم أستطع إضافة import createAdminClient");
}
function ensureHelpers(content) {
  if (content.includes("function normalizeContactRequestInput") && content.includes("function getContactNotifyEmail")) return content;
  const marker = "export async function savePlatformHomeSettingsAction";
  if (!content.includes(marker)) throw new Error("لم أجد موضع إضافة helpers في platform-content.ts");
  return content.replace(marker, HELPERS + marker);
}
function patchPlatformContentAction() {
  const rel = "app/actions/platform-content.ts";
  let content = read(rel);
  const before = content;
  content = ensureImport(content);
  content = ensureHelpers(content);

  const start = content.indexOf("export async function submitContactRequestAction");
  if (start === -1) throw new Error("لم أجد submitContactRequestAction");
  let end = content.indexOf("export async function recordIntroVideoEventAction", start);
  if (end === -1) end = findFunctionEnd(content, start);
  content = content.slice(0, start) + NEW_FUNCTION + content.slice(end);

  // Remove unused direct table insert import only if it somehow remained impossible here is handled by tsc if actual unused is enabled; project does not block unused imports.
  return write(rel, content);
}
function writeDbFixFiles() {
  const migrationRel = "supabase/migrations/20260617_104500_contact_request_final_fix.sql";
  const rootSqlRel = "BARNDAKSA_CONTACT_REQUEST_DB_FIX.sql";
  const a = write(migrationRel, SQL_CONTENT);
  const b = write(rootSqlRel, SQL_CONTENT);
  return a || b;
}
function main() {
  if (!fs.existsSync(filePath("package.json"))) throw new Error("شغل السكربت من جذر المشروع الذي يحتوي package.json");
  const changed = [];
  if (patchPlatformContentAction()) changed.push("app/actions/platform-content.ts");
  if (writeDbFixFiles()) changed.push("BARNDAKSA_CONTACT_REQUEST_DB_FIX.sql + migration");
  console.log(`✅ ${PATCH_NAME} applied successfully`);
  console.log(`📦 Backup: ${BACKUP_DIR}`);
  console.log(changed.length ? `🛠️ Changed files:\n- ${changed.join("\n- ")}` : "No changes needed.");
  console.log("\nIMPORTANT DB STEP:");
  console.log("افتح Supabase SQL Editor وشغل محتوى الملف: BARNDAKSA_CONTACT_REQUEST_DB_FIX.sql مرة واحدة فقط.");
  console.log("\nNext commands:");
  console.log("npm exec tsc -- --noEmit");
  console.log("npm run build");
}
try { main(); } catch (error) { console.error("❌ Patch failed:", error instanceof Error ? error.message : error); process.exit(1); }
