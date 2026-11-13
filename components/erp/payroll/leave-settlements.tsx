"use client";
import type {PayrollSnapshot} from '@/lib/erp/payroll';
import s from '../erp.module.css';
export type LeaveSettlementSelection={id:string;dailyRate:number};
export function PayrollLeaveSettlements({data,employeeId,values,onChange}:{data:PayrollSnapshot;employeeId:string;values:LeaveSettlementSelection[];onChange:(values:LeaveSettlementSelection[])=>void}){
 const choices=data.leaveSettlements.filter(x=>x.employeeId===employeeId);
 return <section className={`${s.panel} ${s.body}`}><h2>تسوية رصيد الإجازات</h2><p className={s.muted}>اختر تسوية إجازة معتمدة وحدد قيمة اليوم بعملة القسيمة وفق الاتفاق المعتمد مع الموظف</p>{choices.map(item=>{const selected=values.find(v=>v.id===item.id);return <div className={s.form} key={item.id}><label className={s.checkbox}><input type="checkbox" checked={!!selected} onChange={e=>onChange(e.target.checked?[...values,{id:item.id,dailyRate:0}]:values.filter(v=>v.id!==item.id))}/>{item.name} — {item.days} يوم — {item.effectiveOn}</label>{selected&&<><label className={s.field}><span>قيمة اليوم *</span><input type="number" min={0.01} max={1e9} step="0.01" required value={selected.dailyRate} onChange={e=>onChange(values.map(v=>v.id===item.id?{...v,dailyRate:e.target.valueAsNumber}:v))}/></label><span>{(item.days*selected.dailyRate).toLocaleString('ar-SA',{maximumFractionDigits:2})}</span></>}</div>;})}{!choices.length&&<p className={s.empty}>لا توجد تسويات إجازة معتمدة لهذا الموظف</p>}</section>;
}
