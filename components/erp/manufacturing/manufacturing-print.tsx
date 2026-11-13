"use client";
import {manufacturingEstimate,manufacturingLabels,manufacturingStates,type ManufacturingRecord,type ManufacturingSnapshot} from "@/lib/erp/manufacturing";
import {TemplatePrintChooser} from "@/components/erp/templates/template-print-chooser";
const kinds={bom:"manufacturing_bom",orders:"manufacturing_order",plans:"manufacturing_plan",workstations:"manufacturing_workstation",routings:"manufacturing_routing",overheads:"manufacturing_overhead"};
const number=(value:unknown)=>Number(value||0).toLocaleString("ar-SA",{maximumFractionDigits:4});
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.filter((x):x is Record<string,unknown>=>!!x&&typeof x==="object"):[];
export function ManufacturingPrint({record:r,snapshot:s}:{record:ManufacturingRecord;snapshot:ManufacturingSnapshot}){
 const p=r.payload,l=s.lookups,table:{head:string[];rows:string[][]}={head:["البند","الكمية","التكلفة / التفاصيل"],rows:[]};
 const name=(items:{id:string;name:string}[],id:unknown)=>items.find(x=>x.id===id)?.name||"—";
 if(r.kind==="bom"||r.kind==="orders"){
  table.rows=rows(p.materials).map(x=>[name(l.items,x.itemId),number(x.quantity),number(Number(x.price)*Number(x.quantity))]);
  table.rows.push(...rows(p.expenses).map(x=>[String(x.name||"مصروف"),"—",number(x.amount)]),...rows(p.operations).map(x=>[name(l.workstations,x.workstationId),number(x.quantity),String(x.stage||"—")]));
  table.rows.push(["التكلفة التقديرية","—",number(manufacturingEstimate(p,l.workstations).total)]);
  if(r.kind==="orders")table.rows.push(["تكلفة الخامات الفعلية","—",number(r.material_cost)],["التكلفة الإضافية الفعلية","—",number(r.additional_cost)],["الناتج الفعلي",number(r.output_quantity),"—"]);
 }else if(r.kind==="plans")table.rows=rows(p.items).map(x=>[name(l.items,x.productId),number(x.quantity),name(l.bom,x.bomId)]);
 else if(r.kind==="routings")table.rows=(Array.isArray(p.stages)?p.stages:[]).map((x,i)=>[String(x),String(i+1),"—"]);
 else if(r.kind==="workstations")table.rows=[...rows(p.expenses).map(x=>[String(x.name||"مصروف"),String(p.unit||""),number(x.amount)]),["الأجور",String(p.unit||""),number(p.wagesCost)],["تكلفة الأصل",String(p.unit||""),number(p.assetsCost)]];
 else table.rows=rows(p.sources).map(x=>[name(l.sources,x.documentId),"—",number(x.amount)]);
 return <TemplatePrintChooser kind={kinds[r.kind]} slug={s.slug} values={{"العلامة":s.cafeName??s.slug,"العنوان":`${manufacturingLabels[r.kind]} — ${r.name}`,"رقم_المستند":r.code,"التاريخ":r.created_at.slice(0,10),"الوصف":[manufacturingStates[r.status],p.description].filter(Boolean).join(" — "),"الكمية":number(p.quantity),"عدد_البنود":table.rows.length}} table={table}/>;
}
