'use client';
import {TrackingRows} from '@/components/erp/inventory/tracking';
import type {PurchaseCommand,PurchaseSnapshot} from '@/lib/erp/purchases';
type ReceiveCommand=Extract<PurchaseCommand,{action:'receive'}>;
export function PurchaseReceiptTracking({snapshot,command,onChange,disabled}:{snapshot:PurchaseSnapshot;command:ReceiveCommand;onChange:(command:ReceiveCommand)=>void;disabled:boolean}){
 const invoice=snapshot.invoices.find(x=>x.id===command.payload.id);
 const source=snapshot.records.find(x=>x.financeId===command.payload.id);
 return <div>{invoice?.lines.filter(l=>l.item_id&&snapshot.itemDefaults[l.item_id]?.trackingMode&&snapshot.itemDefaults[l.item_id].trackingMode!=='quantity').map(l=><section key={l.id}><h3>{l.name}</h3><TrackingRows mode={snapshot.itemDefaults[l.item_id!].trackingMode!} value={command.payload.tracking?.[l.id]??source?.lines.find(x=>x.id===l.id)?.tracking??[]} expected={Number(l.quantity)} disabled={disabled} onChange={rows=>onChange({...command,payload:{...command.payload,tracking:{...command.payload.tracking,[l.id]:rows}}})}/></section>)}</div>;
}
