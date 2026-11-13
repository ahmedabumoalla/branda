import "server-only";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { manufacturingQuerySchema, type ManufacturingQuery, type ManufacturingSnapshot } from "@/lib/erp/manufacturing";

export function manufacturingError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST202" || error.code === "42883") throw new Error("خدمة التصنيع لم تُفعّل في قاعدة البيانات بعد");
  if (error.code === "40001") throw new Error("تغيرت البيانات في جلسة أخرى أعد تحميلها قبل المحاولة");
  if (error.code === "23505") throw new Error("الكود مستخدم بالفعل اختر كودًا آخر");
  if (error.code === "42501") throw new Error("لا تملك صلاحية هذا الإجراء");
  if (error.message && /[\u0600-\u06ff]/u.test(error.message) && error.message.length < 300) throw new Error(error.message);
  throw new Error("تعذر تأكيد بيانات التصنيع حاول مجددًا");
}
export async function manufacturingContext(write = false, settings = false, slug?: string) {
  const context = await getBrandFinanceContext(slug);
  if (!["owner", "manager", "accountant", "auditor"].includes(context.cafe.role) || write && context.cafe.role === "auditor" || settings && context.cafe.role !== "owner") throw new Error("لا تملك صلاحية التصنيع المطلوبة");
  return context;
}
export async function readManufacturing(query: ManufacturingQuery, slug?: string): Promise<ManufacturingSnapshot> {
  const q = manufacturingQuerySchema.parse(query);
  const { client, cafe } = await manufacturingContext(false,false,slug);
  const { data, error } = await client.rpc("erp_manufacturing_read", { p_cafe_id: cafe.id, p_kind: q.kind, p_id: q.id || null, p_query: q.query, p_status: q.status, p_page: q.page, p_filters:q.filters });
  manufacturingError(error);
  if (!data || !Array.isArray(data.records) || !data.lookups) throw new Error("استجابة التصنيع غير مكتملة");
  const formsResult = await client.rpc('erp_manufacturing_forms_read', {p_cafe:cafe.id,p_kind:q.kind === 'plans' ? 'plans' : 'orders',p_record:q.id || null});
  manufacturingError(formsResult.error);
  const assetResult = await client.rpc("erp_asset_read", {p_cafe:cafe.id});
  if(assetResult.error && !["PGRST202","42883"].includes(assetResult.error.code)) manufacturingError(assetResult.error);
  return { ...data, forms:formsResult.data, slug: cafe.slug, cafeName:cafe.name, lookups:{...data.lookups,assets:assetResult.data?.assetOptions||[]} } as ManufacturingSnapshot;
}
