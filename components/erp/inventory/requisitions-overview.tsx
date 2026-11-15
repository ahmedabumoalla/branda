'use client';
import {useSystemFormat} from '@/components/erp/settings/preferences';
import {inventoryKinds,type InventorySnapshot} from '@/lib/erp/inventory';
import v from './requisitions.module.css';

// Display only: counts the stock vouchers already loaded for the list, no extra reads or actions.
const kindOrder=['receipt','issue','transfer','assembly','disassembly'] as const;
export function RequisitionOverview({snapshot}:{snapshot:InventorySnapshot}){
 const number=useSystemFormat().number;
 const documents=snapshot.documents.filter(d=>!['stocktake','request'].includes(d.kind));
 const count=(status:string)=>documents.filter(d=>d.status===status).length;
 const tiles=[
  {label:'إجمالي الأذون',value:documents.length,tone:v.tileLead},
  {label:'مسودات',value:count('draft'),tone:v.tileDraft},
  {label:'بانتظار التنفيذ',value:count('pending'),tone:v.tilePending},
  {label:'تم الترحيل',value:count('posted'),tone:v.tilePosted},
 ];
 const kinds=kindOrder.map(kind=>({kind,total:documents.filter(d=>d.kind===kind).length})).filter(k=>k.total>0);
 return <div aria-label="ملخص الأذون المخزنية">
  <div className={v.overview}>{tiles.map(t=><div key={t.label} className={`${v.tile} ${t.tone}`}><span className={v.tileLabel}>{t.label}</span><strong className={v.tileValue}>{number(t.value)}</strong></div>)}</div>
  {kinds.length>0&&<div className={v.kinds}>{kinds.map(k=><span key={k.kind} className={v.kind} data-kind={k.kind}>{inventoryKinds[k.kind]}<strong>{number(k.total)}</strong></span>)}</div>}
 </div>;
}
