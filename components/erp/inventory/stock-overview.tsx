'use client';
import {useSystemFormat} from '@/components/erp/settings/preferences';
import type {InventorySnapshot} from '@/lib/erp/inventory';
import v from './requisitions.module.css';

// Display only: counts the stock items already loaded for the list, using the same rules as the status filter.
export function StockOverview({snapshot}:{snapshot:InventorySnapshot}){
 const number=useSystemFormat().number;
 const items=snapshot.items;
 const tiles=[
  {label:'إجمالي الأصناف',value:items.length,tone:v.tileLead},
  {label:'نشط',value:items.filter(i=>i.meta.status==='active').length,tone:v.tilePosted},
  {label:'مخزون منخفض',value:items.filter(i=>i.quantity<i.min_quantity).length,tone:v.tilePending},
  {label:'غير متوفر',value:items.filter(i=>i.quantity<=0).length,tone:v.tileOut},
 ];
 return <div className={v.overview} aria-label="ملخص الأصناف المخزنية">{tiles.map(t=><div key={t.label} className={`${v.tile} ${t.tone}`}><span className={v.tileLabel}>{t.label}</span><strong className={v.tileValue}>{number(t.value)}</strong></div>)}</div>;
}
