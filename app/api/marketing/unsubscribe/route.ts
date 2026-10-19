import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMarketingUnsubscribe } from "@/lib/marketing/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" };
function parse(id: string | null, token: string | null) {
  return Boolean(id && token && z.uuid().safeParse(id).success && /^[A-Za-z0-9_-]{43}$/.test(token) && verifyMarketingUnsubscribe(id, token));
}
function html(title: string, content: string, status = 200) {
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;background:#faf7f0;color:#282c23;font:18px Tahoma,sans-serif"><main style="max-width:480px;margin:12vh auto;padding:32px"><h1>${title}</h1>${content}</main></body></html>`, { status, headers });
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, id = params.get("id"), token = params.get("token");
  try {
    if (!parse(id, token)) return html("الرابط غير صالح", "<p>تحقق من رابط إيقاف الرسائل الموجود في الرسالة</p>", 400);
    // GET never unsubscribes: mail/link scanners cannot change the recipient's preference.
    return html("إيقاف الرسائل التسويقية", `<p>سيتم إيقاف الرسائل التسويقية من هذه العلامة إلى رقمك</p><form method="post"><input type="hidden" name="id" value="${id}"><input type="hidden" name="token" value="${token}"><button type="submit" style="background:#303a27;color:white;border:0;border-radius:12px;padding:16px 24px;font:inherit">تأكيد إيقاف الرسائل</button></form>`);
  } catch { return html("الخدمة غير متاحة", "<p>حاول مجددًا لاحقًا</p>", 503); }
}
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 1024) return html("الرابط غير صالح", "", 400);
    const form = new URLSearchParams(raw), id = form.get("id"), token = form.get("token");
    if (!parse(id, token)) return html("الرابط غير صالح", "", 400);
    const db = createAdminClient();
    const { data, error } = await db.from("brand_marketing_recipients").select("cafe_id,phone").eq("id", id!).maybeSingle();
    if (error) throw new Error("UNSUBSCRIBE_UNAVAILABLE");
    if (data) {
      const result = await db.rpc("marketing_suppress", { p_cafe: data.cafe_id, p_phone: data.phone, p_reason: "link" });
      if (result.error) throw new Error("UNSUBSCRIBE_UNAVAILABLE");
    }
    return html("تم إيقاف الرسائل", "<p>لن تتلقى حملات تسويقية جديدة من هذه العلامة</p>");
  } catch { return html("تعذر إيقاف الرسائل الآن", "<p>أعد المحاولة أو أرسل إيقاف إلى رقم العلامة</p>", 503); }
}
