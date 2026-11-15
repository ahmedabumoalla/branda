const fs=require('node:fs');
function edit(file,changes){let source=fs.readFileSync(file,'utf8');for(const [before,after]of changes){if(!source.includes(before))throw Error('Missing marker '+file+': '+before.slice(0,70));source=source.replace(before,()=>after);}fs.writeFileSync(file,source);}
edit('lib/erp/inventory.ts',[
 ["request:'طلب مخزني'","request:'طلب مخزني',assembly:'تجميع صنف',disassembly:'تفكيك صنف'"],
 ["kind:z.enum(['receipt','issue','transfer','stocktake','request'])","kind:z.enum(['receipt','issue','transfer','stocktake','request','assembly','disassembly'])"],
 ['quantity:number;image_path','quantity:number;reserved?:number;available?:number;image_path'],
 ['quantity:number;average_cost:number;value:number','quantity:number;reserved?:number;available?:number;average_cost:number;value:number']
]);
edit('components/erp/inventory/item-editor.tsx',[
 ["import {useState} from 'react';","import {useState} from 'react';\nimport {BundleRecipe,type BundleComponent} from './lifecycle';"],
 ['<Panel title="خيارات أكثر">',"{d.kind==='product'&&(snapshot.settings.payload.bundlesEnabled||Array.isArray(d.payload.bundleComponents)&&d.payload.bundleComponents.length>0)&&<BundleRecipe snapshot={snapshot} itemId={item?.id} value={(d.payload.bundleComponents??[]) as BundleComponent[]} onChange={v=>detail('bundleComponents',v)} disabled={busy||!snapshot.settings.payload.bundlesEnabled}/>}<Panel title=\"خيارات أكثر\">"]
]);
edit('components/erp/inventory/document-editor.tsx',[
 ["import {TrackingRows} from './tracking';","import {TrackingRows} from './tracking';\nimport {BundleFields} from './lifecycle';"],
 ["Object.entries(inventoryKinds).map(","Object.entries(inventoryKinds).filter(([key])=>!['assembly','disassembly'].includes(key)||snapshot.settings.payload.bundlesEnabled||doc?.kind===key).map("],
 ['</div></Panel><Panel title={d.kind',"{d.kind==='request'&&<label className={s.check}><input type=\"checkbox\" checked={d.payload.reserveStock===true} onChange={e=>set('payload',{...d.payload,reserveStock:e.target.checked})}/>حجز الكمية عند إرسال الطلب</label>}{d.kind==='stocktake'&&<><label className={s.check}><input type=\"checkbox\" checked={Boolean(d.payload.countByDate??snapshot.settings.payload.countByDate)} onChange={e=>set('payload',{...d.payload,countByDate:e.target.checked})}/>حساب الرصيد حتى تاريخ الجرد</label><p className={s.muted}>يحفظ الرصيد التاريخي عند حفظ المسودة راجعه في تفاصيل الجرد قبل إنهائه وترحيله</p></>}</div></Panel>{['assembly','disassembly'].includes(d.kind)&&<BundleFields snapshot={snapshot} value={d} onChange={setD} disabled={busy}/>}<Panel title={d.kind"],
 ["d.kind==='issue'||d.kind==='transfer'?-1:1","d.kind==='issue'||d.kind==='transfer'||d.kind==='assembly'?-1:1"],
 ['incoming={d.kind==="receipt"||','incoming={d.kind==="receipt"||d.kind==="disassembly"||']
]);
edit('components/erp/inventory/settings.tsx',[
 ["['stockRequests','الطلبات المخزنية'],","['stockRequests','الطلبات المخزنية'],['bundlesEnabled','تجميع المنتجات وتفكيكها'],['showAvailableStock','إظهار الكمية المحجوزة والمتاحة'],['countByDate','حساب الجرد حتى تاريخ ورقة الجرد'],"],
 ['(key!=="trackingEnabled")','(["advancedPricing","multiUnits","secondaryLanguage","stockRequests"].includes(key))'],
 ['<Panel title="المخزون السالب">','<Panel title="حساب تسوية المخزون الافتراضي"><Field label="الحساب"><Select value={String(d.defaultAdjustmentAccountId??\'\')} onChange={v=>set(\'defaultAdjustmentAccountId\',v)} options={snapshot.accounts.filter(a=>[\'expense\',\'equity\'].includes(a.kind))} empty="الحساب الافتراضي للنظام"/></Field></Panel><Panel title="المخزون السالب">']
]);
edit('components/erp/inventory/workspace.tsx',[
 ["import {TrackingLedger} from './tracking';","import {TrackingLedger} from './tracking';\nimport {AvailableStock} from './lifecycle';"],
 ['{numberText(inventoryDisplayStock(i,snapshot).quantity)}</td>','{numberText(inventoryDisplayStock(i,snapshot).quantity)}{snapshot.settings.payload.showAvailableStock===true&&<div><AvailableStock quantity={Number(i.quantity)} reserved={i.reserved}/><small> {i.unit}</small></div>}</td>'],
 ['{numberText(x.quantity)}</td>','{numberText(x.quantity)}{snapshot.settings.payload.showAvailableStock===true&&<div><AvailableStock quantity={Number(x.quantity)} reserved={x.reserved}/></div>}</td>'],
 ['{doc.to_warehouse_id&&<div>','{[\'assembly\',\'disassembly\'].includes(doc.kind)&&<><div>الصنف المركب<strong>{snapshot.items.find(i=>i.id===doc.payload.bundleItemId)?.name}</strong></div><div>كمية الصنف المركب<strong>{numberText(doc.payload.bundleQuantity)}</strong></div><div>التكلفة الفعلية<strong>{doc.payload.actualCost==null?\'تحدد عند الترحيل\':numberText(doc.payload.actualCost)}</strong></div></>}{doc.payload.reserveStock===true&&<div>حجز الكمية<strong>{doc.status===\'pending\'?\'محجوز\':\'غير محجوز\'}</strong></div>}{doc.kind===\'stocktake\'&&<div>رصيد المقارنة<strong>{doc.payload.countByDate===true?\'حتى تاريخ الجرد\':\'الرصيد الحالي\'}</strong></div>}{doc.to_warehouse_id&&<div>']
]);
