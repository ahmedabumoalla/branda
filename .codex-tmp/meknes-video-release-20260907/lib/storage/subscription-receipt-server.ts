import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME = new Set(["image/webp", "image/jpeg", "image/png"]);

export async function uploadSubscriptionReceipt(requestId: string, file: File) {
  const cafe = await requireOwnerCafeContext();

  if (!requestId || requestId.includes("/") || requestId.includes("..")) {
    throw new Error("طلب الاشتراك غير صالح");
  }

  if (!ALLOWED_RECEIPT_MIME.has(file.type)) {
    throw new Error("ارفع إيصال التحويل بصيغة PNG أو JPG أو WEBP");
  }

  if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) {
    throw new Error("حجم الإيصال يجب ألا يتجاوز 4MB");
  }

  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${cafe.id}/${requestId}/${crypto.randomUUID()}.${extension}`;
  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from("subscription-receipts")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error: attachError } = await supabase.rpc("attach_subscription_payment_receipt", {
    p_request_id: requestId,
    p_storage_path: storagePath,
  });

  if (attachError) {
    await supabase.storage.from("subscription-receipts").remove([storagePath]);
    throw attachError;
  }

  return storagePath;
}
