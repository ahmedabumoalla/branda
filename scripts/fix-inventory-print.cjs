const fs=require('fs');function edit(file,changes){let s=fs.readFileSync(file,'utf8');for(const[b,a]of changes){if(!s.includes(b))throw Error('Marker missing '+file);s=s.replace(b,()=>a);}fs.writeFileSync(file,s);}
edit('app/actions/erp-templates.ts',[
 ['documentTemplateError,readDocumentTemplates','documentTemplateError,readOptionalDocumentTemplates'],
 ['import sharp from "sharp";','import sharp from "sharp";\nimport {getBrandFinanceContext} from "@/lib/data/brand-finance";'],
 ['()=>readDocumentTemplates(kind,slug)','()=>readOptionalDocumentTemplates(kind,slug)'],
 ['await documentTemplateContext(slug);const t=documentTemplateSchema','await getBrandFinanceContext(slug);const t=documentTemplateSchema']
]);
edit('lib/erp/templates.ts',[[ '["staff_request","طلبات الموظفين"],','["staff_request","طلبات الموظفين"],["stock_request","الطلبات المخزنية"],']]);
edit('components/erp/inventory/workspace.tsx',[
 ["?'stock_request':'stock_requisition'","?'stock_request':'requisition'"],
 ["values={{'اسم المنشأة':snapshot.cafeName,'رقم المستند':record.code,'التاريخ':record.effective_on,'المستودع':snapshot.warehouses.find(w=>w.id===record.warehouse_id)?.name??'','الملاحظات':String(record.payload.note??'')}}", "values={{'العلامة':snapshot.cafeName,'رقم_المستند':record.code,'العنوان':inventoryKinds[record.kind],'التاريخ':record.effective_on,'الوصف':[snapshot.warehouses.find(w=>w.id===record.warehouse_id)?.name??'',String(record.payload.note??''),...(['assembly','disassembly'].includes(record.kind)?[snapshot.items.find(i=>i.id===record.payload.bundleItemId)?.name??'',numberText(record.payload.bundleQuantity)]:[])].filter(Boolean).join(' / ')}}"]
]);
