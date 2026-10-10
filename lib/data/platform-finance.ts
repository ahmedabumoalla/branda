import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { financeDefaults, financeDraftSchema, financeFilterSchema, type FinanceOptions, type FinancePage } from "@/lib/finance/platform-finance";

export async function getFinancePage(input: unknown = financeDefaults()): Promise<FinancePage> {
  await requirePlatformAdmin();
  const filter = financeFilterSchema.parse(input);
  const db = await createClient();
  let query = db.from("platform_finance_entries").select("id,voucher_number,kind,source,category,party,description,occurred_on,currency,amount,exchange_rate,amount_sar,reference,notes,subscription_id,subscription_request_id,receipt_path", { count: "exact" })
    .gte("occurred_on", filter.from).lte("occurred_on", filter.to);
  if (filter.kind !== "all") query = query.eq("kind", filter.kind);
  const [rows, totals] = await Promise.all([
    query.order("occurred_on", { ascending: false }).order("id", { ascending: false }).range(filter.page * 20, filter.page * 20 + 19),
    db.rpc("admin_finance_totals", { p_from: filter.from, p_to: filter.to }),
  ]);
  if (rows.error) throw rows.error;
  if (totals.error) throw totals.error;
  const total = rows.count ?? 0;
  if (filter.page > 0 && filter.page * 20 >= total) return getFinancePage({ ...filter, page: Math.max(0, Math.ceil(total / 20) - 1) });
  return { entries: (rows.data ?? []).map(({ receipt_path, ...row }) => ({ ...row, hasReceipt: !!receipt_path })), total, filter, totals: totals.data } as FinancePage;
}

export async function getFinanceOptions(): Promise<FinanceOptions> {
  await requirePlatformAdmin();
  const db = await createClient();
  const [cafes, plans, requests] = await Promise.all([
    db.from("cafes").select("id,name").is("deleted_at", null).order("name").limit(1000),
    db.from("platform_plans").select("id,name,price_sar,annual_discount_percent,duration_options").eq("active", true).gt("price_sar", 0).order("price_sar"),
    db.from("subscription_payment_requests").select("id,cafe_id,plan_id,plan_name,amount_sar,duration_count,coupon_code_snapshot").in("status", ["awaiting_receipt", "pending_review"]).order("created_at").limit(1000),
  ]);
  for (const result of [cafes, plans, requests]) if (result.error) throw result.error;
  if (cafes.data?.length === 1000 || requests.data?.length === 1000) throw new Error("عدد العلامات كبير يرجى استخدام طلبات الاشتراك إلى حين تحميل القائمة كاملة");
  return { cafes: cafes.data ?? [], plans: plans.data ?? [], requests: requests.data ?? [] } as FinanceOptions;
}

export async function postFinanceEntry(input: unknown, form: FormData) {
  await requirePlatformAdmin();
  const parsed = financeDraftSchema.safeParse(input);
  if (!parsed.success) throw new Error("راجع بيانات السند والمبلغ والتاريخ ثم حاول مجددًا");
  const { id, ...draft } = parsed.data;
  const file = form.get("receipt");
  // Leave room for multipart overhead under the production request-size limit
  if (!(file instanceof File) || file.size <= 0 || file.size > 4 * 1024 * 1024) throw new Error("أرفق إيصالًا بحد أقصى 4 ميجابايت");
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = bytes.subarray(0, 5).toString("ascii") === "%PDF-" ? "pdf"
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpg"
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png" : null;
  if (!kind) throw new Error("صيغة الإيصال غير مدعومة استخدم PDF أو JPG أو PNG");
  const receiptPath = `${id}/${createHash("sha256").update(bytes).digest("hex")}.${kind}`;
  const db = await createClient();
  const { error: uploadError } = await db.storage.from("platform-finance-receipts").upload(receiptPath, bytes, {
    contentType: kind === "pdf" ? "application/pdf" : kind === "jpg" ? "image/jpeg" : "image/png", upsert: false,
  });
  if (uploadError && !["409", "Duplicate"].includes(String(uploadError.statusCode)) && uploadError.message !== "The resource already exists") throw new Error("تعذر رفع الإيصال حاول مجددًا");
  const { data, error } = await db.rpc("admin_post_finance_entry", { p_id: id, p_input: { ...draft, receiptPath } });
  if (error) {
    const message = error.message ?? "";
    if (/amount mismatch|Subscription amount mismatch/.test(message)) throw new Error("المبلغ لا يطابق قيمة الاشتراك حدّث بيانات الباقة أو اختر طلب العميل الموجود");
    if (/Select the existing/.test(message)) throw new Error("يوجد طلب اشتراك لهذه العلامة حدّث الصفحة ثم اختر الطلب الموجود لتجنب تكرار التحصيل");
    if (/different details/.test(message)) throw new Error("تم تسجيل هذا السند مسبقًا ببيانات مختلفة حدّث السجل قبل إضافة سند آخر");
    throw new Error("تعذر تأكيد حفظ السند أعد المحاولة بنفس البيانات والإيصال للتحقق دون تكراره");
  }
  return { id: data as string, kind: draft.kind };
}

export async function getFinanceReceipt(input: unknown) {
  await requirePlatformAdmin();
  const id = z.string().uuid().parse(input);
  const db = await createClient();
  const { data: row, error } = await db.from("platform_finance_entries").select("receipt_bucket,receipt_path,cafe_id,subscription_request_id").eq("id", id).single();
  if (error || !row?.receipt_path) throw new Error("لا يوجد إيصال مرفق بهذا السند");
  const prefix = row.receipt_bucket === "platform-finance-receipts" ? `${id}/` : `${row.cafe_id}/${row.subscription_request_id}/`;
  if (!["platform-finance-receipts", "subscription-receipts"].includes(row.receipt_bucket) || !row.receipt_path.startsWith(prefix) || row.receipt_path.includes("..")) throw new Error("مسار الإيصال غير صالح");
  const signed = await db.storage.from(row.receipt_bucket).createSignedUrl(row.receipt_path, 300);
  if (signed.error || !signed.data) throw new Error("تعذر فتح الإيصال حاول مجددًا");
  return signed.data.signedUrl;
}
