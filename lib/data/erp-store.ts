import "server-only";
import { getBrandFinanceContext, readBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { storeSettings, validateStoreData, type StoreGallery, type StoreRecord, type StoreSnapshot } from "@/lib/erp/store";

export function storeRpcError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "40001") throw new Error("تغيرت البيانات في جلسة أخرى أعد تحميل الصفحة قبل الحفظ");
  if (error.code === "23505") throw new Error("المعرف مستخدم بالفعل اختر معرفًا آخر");
  if (error.code === "23503") throw new Error("السجل مرتبط ببيانات أخرى ولا يمكن حذفه");
  if (error.code === "42501") throw new Error("لا تملك صلاحية هذه العملية في المتجر");
  if (error.code === "PGRST202" || error.code === "42883") throw new Error("قاعدة بيانات المتجر لم تجهز بعد");
  if (error.code === "22023" && /[\u0600-\u06ff]/.test(error.message ?? "")) throw new Error(error.message);
  throw new Error("تعذر تأكيد بيانات المتجر أعد المحاولة");
}
export async function readStoreSnapshot(): Promise<StoreSnapshot> {
  const context = await getBrandFinanceContext();
  if (!["owner","manager","accountant","auditor"].includes(context.cafe.role)) throw new Error("لا تملك صلاحية إدارة المتجر");
  const [{ data, error }, finance] = await Promise.all([context.client.rpc("erp_store", { p_cafe_id: context.cafe.id }), readBrandFinanceSnapshot(context)]);
  storeRpcError(error);
  const records = (data as StoreRecord[]).map(r=>({...r,data:validateStoreData(r.kind,r.data)}));
  const assets = records.filter(r=>r.kind==="gallery").flatMap(r=>(r.data as StoreGallery).assets);
  if (assets.length) {
    const paths = assets.map(a=>a.path).filter(p=>p.startsWith(context.cafe.id+"/"));
    const signed = await context.client.storage.from("erp-store-media").createSignedUrls(paths, 3600);
    if (signed.error) throw new Error("تعذر تحميل صور المتجر أعد المحاولة");
    const urls = new Map(signed.data.map(x=>[x.path,x.signedUrl]));
    assets.forEach(a=>{a.url=urls.get(a.path)??undefined;});
  }
  const chosen=storeSettings(records).warehouseId??finance.warehouses.find(w=>w.active)?.id;
  return { records,canWrite:context.cafe.role==="owner",cafe:context.cafe,warehouses:finance.warehouses.filter(w=>w.active),products:finance.products.map(p=>{
    const components=p.stock_components?.length?p.stock_components:p.itemId?[{item_id:p.itemId,quantity:1}]:[];
    const quantity=p.stockTracked&&components.length?Math.max(0,Math.min(...components.map(c=>{const stock=finance.stock.find(s=>s.warehouse_id===chosen&&s.item_id===c.item_id);return c.quantity>0?(stock?.quantity??0)/c.quantity:0;}))):p.quantity;
    return{id:p.id,name:p.name,category:p.category,price:p.price,imageUrl:p.imageUrl,quantity,stockTracked:p.stockTracked,available:p.available};
  }) };
}
