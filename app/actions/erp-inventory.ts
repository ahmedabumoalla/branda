'use server';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {inventoryContext} from '@/lib/data/erp-inventory';
import {inventoryCommandSchema,type InventorySnapshot} from '@/lib/erp/inventory';
import {assetError} from '@/lib/data/erp-assets';
import {revalidatePath} from 'next/cache';
export async function executeInventory(input:unknown,slug?:string){
  try{
    const command=inventoryCommandSchema.parse(branchInput(input));
    const{client,cafe}=await inventoryContext(true,slug);
    if(command.action==='item'&&command.payload.unitTemplateId){
      const current=await client.rpc('erp_inventory_read',{p_cafe:cafe.id,p_query:{id:command.id||null}});
      assetError(current.error);
      const snapshot=current.data as Pick<InventorySnapshot,'catalogs'|'units'>|null;
      if(!Array.isArray(snapshot?.catalogs)||!Array.isArray(snapshot?.units))throw new Error('تعذر التحقق من قالب الوحدات أعد تحميل الصفحة');
      const template=snapshot.catalogs.find(row=>row.id===command.payload.unitTemplateId&&row.kind==='unit_template'&&row.active);
      if(!template)throw new Error('قالب الوحدات غير متاح لهذا الصنف');
      const units=(Array.isArray(template.payload.units)?template.payload.units:[]) as {name?:unknown;factor?:unknown}[];
      const baseUnits=units.filter(unit=>unit&&Number(unit.factor)===1);
      if(baseUnits.length!==1||typeof baseUnits[0].name!=='string')throw new Error('قالب الوحدات يحتاج وحدة أساسية واحدة بمعامل ١');
      const base=snapshot.units.find(unit=>unit.id===command.payload.unitId);
      if(!base||base.name!==baseUnits[0].name)throw new Error('الوحدة الأساسية للصنف يجب أن تطابق الوحدة الأساسية في القالب');
      const details=command.payload.payload as Record<string,unknown>|undefined;
      for(const key of ['buyUnitName','saleUnitName']){
        const name=details?.[key];
        if(name!==undefined&&name!==null&&name!==''&&!units.some(unit=>unit&&unit.name===name))throw new Error('وحدة الشراء والبيع يجب أن تكون من وحدات القالب المختار');
      }
    }
    const{data,error}=await branchRpc(client,cafe.id,'erp_inventory_write',{p_cafe:cafe.id,p_command:command},input);
    assetError(error);
    revalidatePath('/dashboard/system/inventory','layout');
    revalidatePath(`/finance/${cafe.slug}/system/inventory`,'layout');
    return{ok:true as const,data:data as {id:string;financeDocumentId?:string;count?:number}};
  }catch(error){return{ok:false as const,message:error instanceof Error?error.message:'تعذر تنفيذ عملية المخزون'};}
}
