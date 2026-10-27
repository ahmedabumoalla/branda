import "server-only";
import { getBrandFinanceContext } from "./brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { inventoryItemInputSchema, inventoryUnitInputSchema, inventoryImageUrl, isInventoryImagePath, type FinanceInventoryCatalog } from "@/lib/finance/inventory-catalog";

function databaseError(error: {message:string}|null, fallback:string) {
  if(error) throw new Error(/[\u0600-\u06ff]/.test(error.message)&&error.message.length<300?error.message:fallback);
}
export async function getFinanceInventoryCatalog(slug?:string):Promise<FinanceInventoryCatalog> {
  const {client,cafe}=await getBrandFinanceContext(slug);
  if(!canFinance(cafe.role,"inventory_read")) throw new Error("لا تملك صلاحية عرض المخزون");
  const {data,error}=await client.rpc("brand_finance_inventory_catalog",{p_cafe_id:cafe.id});
  databaseError(error,"تعذر تحميل أصناف المستودع");
  const catalog=data as FinanceInventoryCatalog;
  return {...catalog,items:catalog.items.map(item=>({...item,imageUrl:isInventoryImagePath(item.image_path,cafe.id)?inventoryImageUrl(item.image_path,cafe.slug):null}))};
}
export async function saveFinanceInventoryItem(input:unknown,slug?:string) {
  const {requestId,payload}=inventoryItemInputSchema.parse(input);
  const {client,cafe}=await getBrandFinanceContext(slug);
  if(!canFinance(cafe.role,"inventory_write")) throw new Error("لا تملك صلاحية تعديل أصناف المستودع");
  if(payload.imagePath&&!isInventoryImagePath(payload.imagePath,cafe.id)) throw new Error("صورة الصنف غير صالحة لهذه العلامة");
  const {data,error}=await client.rpc("brand_finance_execute",{p_cafe_id:cafe.id,p_operation:"item",p_payload:payload,p_request_id:requestId});
  databaseError(error,"تعذر حفظ الصنف تحقق من الباركود والوحدة والمنتجات المرتبطة");
  const catalog=await getFinanceInventoryCatalog(slug);
  const item=catalog.items.find(row=>row.id===data?.id);
  if(!item) throw new Error("تم حفظ الصنف وتعذر تحديث بياناته أعد المحاولة بنفس الطلب");
  return {item,units:catalog.units};
}
export async function saveFinanceInventoryUnit(input:unknown,slug?:string) {
  const {requestId,name}=inventoryUnitInputSchema.parse(input);
  const {client,cafe}=await getBrandFinanceContext(slug);
  if(!canFinance(cafe.role,"inventory_write")) throw new Error("لا تملك صلاحية إضافة وحدة قياس");
  const {data,error}=await client.rpc("brand_finance_inventory_unit_save",{p_cafe_id:cafe.id,p_name:name,p_request_id:requestId});
  databaseError(error,"تعذر حفظ وحدة القياس");
  return {unit:data as {id:string;name:string}};
}
