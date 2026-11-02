import { createHash, createHmac, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { visitSchema } from "@/lib/representative-visits/schema";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BODY = 4 * 1024 * 1024;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function readForm(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new Error("large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error("large"); }
    chunks.push(part.value);
  }
  return new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
}
async function photo(file: FormDataEntryValue | null, required: boolean) {
  if (!(file instanceof File) || !file.size) { if (required) throw new Error("photo"); return null; }
  if (file.size > 1900000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("photo");
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
  const pipeline = sharp(bytes, { limitInputPixels: 40000000, failOn: "warning" });
  const meta = await pipeline.metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1) throw new Error("photo");
  const result = await pipeline.rotate().resize(1800, 1800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  if (result.length > 2097152) throw new Error("photo");
  return result;
  } catch { throw new Error("photo"); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  // Next may normalize the local URL to localhost while the browser uses 127.0.0.1.
  const publicOrigin = `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
  if (!origin || origin !== publicOrigin || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "افتح النموذج من رابط برندة ثم حاول مجددًا" }, 403);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return reply({ error: "صيغة الطلب غير صحيحة" }, 400);
  try {
    const form = await readForm(request);
    const parsed = visitSchema.safeParse(JSON.parse(String(form.get("data") ?? "{}")));
    if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? "راجع بيانات الزيارة" }, 400);
    const value = parsed.data;
    const brandFile = form.get("photo"), menuFile = form.get("menuPhoto");
    if (!(brandFile instanceof File) || !brandFile.size || brandFile.size > 1900000 || (menuFile instanceof File && menuFile.size > 1900000)) throw new Error("photo");
    const fingerprint = createHash("sha256").update(JSON.stringify(value)).update(Buffer.from(await brandFile.arrayBuffer()));
    if (menuFile instanceof File) fingerprint.update(Buffer.from(await menuFile.arrayBuffer()));
    const ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const ipHash = createHmac("sha256", getSupabaseServiceRoleKey()).update("representative-visits:" + ip).digest("hex");
    const admin = createAdminClient(), token = randomUUID();
    const claim = await admin.rpc("claim_representative_visit", { p_id: value.requestId, p_fingerprint: fingerprint.digest("hex"), p_ip_hash: ipHash, p_token: token });
    if (claim.error) throw new Error("unavailable");
    if (claim.data?.status === "saved") return reply({ ok: true, createdAt: claim.data.createdAt });
    if (claim.data?.status === "rate") return reply({ error: "وصلت لحد المحاولات المؤقت جرّب لاحقًا" }, 429);
    if (claim.data?.status !== "claimed") return reply({ error: claim.data?.status === "busy" ? "الزيارة قيد الحفظ انتظر قليلًا ثم أعد المحاولة" : "تغيرت بيانات الزيارة أعد فتح النموذج لتسجيلها" }, 409);
    const uploaded: string[] = [];
    let finishing = false;
    try {
      const [brand, menu] = await Promise.all([photo(brandFile, true), photo(menuFile, false)]);
      for (const [name, bytes] of [["brand", brand], ["menu", menu]] as const) {
        if (!bytes) continue;
        const path = `${value.requestId}/${token}/${name}.webp`;
        const result = await admin.storage.from("representative-visits").upload(path, bytes, { contentType: "image/webp", upsert: false });
        if (result.error) throw new Error("upload");
        uploaded.push(path);
      }
      // Once finalization starts, an ambiguous network failure must never remove committed photos.
      finishing = true;
      const result = await admin.rpc("finish_representative_visit", { p_id: value.requestId, p_token: token, p_data: { ...value, hasMenu: Boolean(menu) } });
      if (result.error || !result.data) throw new Error("unavailable");
      return reply({ ok: true, createdAt: result.data }, 201);
    } catch (error) {
      if (!finishing) {
        if (uploaded.length) await admin.storage.from("representative-visits").remove(uploaded);
        await admin.from("representative_visit_claims").update({ lease_until: new Date(0).toISOString() }).eq("id", value.requestId).eq("token", token);
      }
      throw error;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unavailable";
    if (reason === "large") return reply({ error: "حجم الصور كبير اختر صورًا أصغر" }, 413);
    if (reason === "photo" || reason.includes("unsupported image")) return reply({ error: "ارفع صورة واضحة بصيغة JPG أو PNG أو WebP" }, 400);
    if (error instanceof SyntaxError) return reply({ error: "راجع بيانات النموذج" }, 400);
    return reply({ error: "تعذر حفظ الزيارة الآن بياناتك ما زالت موجودة حاول مجددًا" }, 503);
  }
}
