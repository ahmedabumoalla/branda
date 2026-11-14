import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicStoreFingerprint } from "@/lib/data/erp-store-public";
import { COMMERCE_ATTACHMENT_LIMIT, prepareCommerceAttachment } from "@/lib/commerce/attachment-file";

export const runtime = "nodejs";
const fields = z.object({ productId: z.uuid(), groupId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/), optionId: z.string().max(100).regex(/^[a-zA-Z0-9_-]*$/), requestId: z.uuid() });
const reservedSchema = z.object({ token: z.uuid(), path: z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/), ready: z.boolean(), name: z.string() });
const errorResponse = (message: string, status = 400) => Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!/^[a-z0-9-]{1,120}$/.test(slug)) return errorResponse("المتجر غير صالح");
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== new URL(request.url).host) return errorResponse("أعد فتح صفحة المتجر لرفع الملف", 403);
    const client = createAdminClient(), rateKey = publicStoreFingerprint(request.headers, slug);
    const admitted = await client.rpc("gift_attachment_admit", { p_slug: slug, p_rate_key: rateKey });
    if (admitted.error) return errorResponse("تعذر رفع الملف حاليًا تحقق من تفعيل الطلبات أو حاول بعد قليل", 429);
    const limit = COMMERCE_ATTACHMENT_LIMIT + 64 * 1024;
    const length = Number(request.headers.get("content-length") || 0);
    if (length > limit || !request.headers.get("content-type")?.startsWith("multipart/form-data;")) return errorResponse("ارفع صورة لا يتجاوز حجمها ٣ ميجابايت", 413);
    const reader = request.body?.getReader();
    if (!reader) return errorResponse("اختر ملفًا للرفع");
    let size = 0; const chunks: Uint8Array[] = [];
    try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > limit) { await reader.cancel(); return errorResponse("حجم الملف يتجاوز ٣ ميجابايت", 413); } chunks.push(next.value); } }
    finally { reader.releaseLock(); }
    const form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type")! }, body: Buffer.concat(chunks) }).formData();
    const parsed = fields.safeParse(Object.fromEntries(["productId", "groupId", "optionId", "requestId"].map(key => [key, String(form.get(key) || "")])));
    const file = form.get("file");
    if (!parsed.success || !(file instanceof File)) return errorResponse("راجع بيانات الملف والمنتج");
    const asset = await prepareCommerceAttachment(Buffer.from(await file.arrayBuffer()), file.type);
    const sha256 = createHash("sha256").update(asset.bytes).digest("hex");
    const reserved = await client.rpc("gift_attachment_reserve", { p_slug: slug, p_rate_key: rateKey, p_input: { ...parsed.data, sha256, mime: asset.mime, bytes: asset.bytes.length, name: asset.name } });
    if (reserved.error) return errorResponse("الملف أو اختيار المنتج غير صالح أعد اختيار الملف");
    const ticket = reservedSchema.parse(reserved.data);
    if (!ticket.ready) {
      const uploaded = await client.storage.from("commerce-attachments").upload(ticket.path, asset.bytes, { contentType: asset.mime, upsert: false, cacheControl: "0" });
      if (uploaded.error) {
        // Storage can return 400 for an existing object. Recover a lost response
        // only after verifying the exact reserved content; never overwrite it.
        const existing = await client.storage.from("commerce-attachments").download(ticket.path);
        if (existing.error || !existing.data || existing.data.size !== asset.bytes.length) return errorResponse("تعذر حفظ الملف حاول مجددًا", 503);
        const existingHash = createHash("sha256").update(Buffer.from(await existing.data.arrayBuffer())).digest("hex");
        if (existingHash !== sha256) return errorResponse("تعذر التحقق من الملف أعد رفعه", 503);
      }
      const ready = await client.rpc("gift_attachment_ready", { p_token: ticket.token, p_sha256: sha256 });
      if (ready.error) return errorResponse("تعذر تأكيد الملف أعد المحاولة", 503);
    }
    return Response.json({ token: ticket.token, name: ticket.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error instanceof Error && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 160 ? error.message : "تعذر قراءة الصورة اختر ملفًا صالحًا وحاول مجددًا");
  }
}
