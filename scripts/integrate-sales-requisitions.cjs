const fs=require('fs');function edit(file,changes){let s=fs.readFileSync(file,'utf8');for(const [before,after]of changes){if(!s.includes(before))throw Error('Marker changed '+file);s=s.replace(before,()=>after);}fs.writeFileSync(file,s);}
edit('components/erp/inventory/workspace.tsx',[
 ["import {TrackingLedger} from './tracking';","import {TrackingLedger} from './tracking';\nimport {SalesRequisitions} from './sales-requisitions';\nimport type {SalesRequisitionSnapshot} from '@/lib/erp/sales-requisitions';"],
 ['{snapshot,module,mode,id,kind}:{snapshot:InventorySnapshot;','{snapshot,module,mode,id,kind,salesRequisitions}:{salesRequisitions?:SalesRequisitionSnapshot;snapshot:InventorySnapshot;'],
 ["{module==='items'&&mode==='import'", "{module==='requisitions'&&mode==='list'&&salesRequisitions&&<SalesRequisitions snapshot={salesRequisitions} inventory={snapshot}/>}\n{module==='items'&&mode==='import'"]
]);
edit('app/dashboard/system/inventory/[[...path]]/page.tsx',[
 ["import {readInventory} from '@/lib/data/erp-inventory';","import {readInventory} from '@/lib/data/erp-inventory';\nimport {readSalesRequisitions} from '@/lib/data/erp-sales-requisitions';"],
 ["const snapshot=await readInventory({id,prices:section==='price-lists'});", "const [snapshot,salesRequisitions]=await Promise.all([readInventory({id,prices:section==='price-lists'}),section==='requisitions'&&mode==='list'?readSalesRequisitions():Promise.resolve(undefined)]);"],
 ['snapshot={snapshot} module={section}', 'snapshot={snapshot} salesRequisitions={salesRequisitions} module={section}']
]);
edit('components/erp/inventory/settings.tsx',[["['stockRequests','الطلبات المخزنية'],","['stockRequests','الطلبات المخزنية'],['salesRequisitions','اعتماد إذن المبيعات الآجلة قبل صرف المخزون'],"]]);
edit('scripts/check-erp-inventory-domain.cjs',[["const mocks={","const mocks={'@/app/actions/erp-sales-requisitions':{},"]]);
