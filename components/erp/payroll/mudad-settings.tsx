"use client";
import type {PayrollSnapshot} from '@/lib/erp/payroll';
import s from '../erp.module.css';
type Settings=NonNullable<PayrollSnapshot['settings']>;
export function PayrollMudadSettings({data,value,onChange}:{data:PayrollSnapshot;value:Settings;onChange:(value:Settings)=>void}){
 const mapping=value.mudad||{basic:['basic'],housing:[],transport:[]};
 const titles={basic:'الراتب الأساسي',housing:'بدل السكن',transport:'بدل النقل'};
 return <section className={s.panel}><h2 className={s.panelTitle}>إعدادات مدد</h2><div className={s.body}><p className={s.muted}>اختر بنود الرواتب المناسبة لكل حقل لتجهيز بيانات التصدير</p><div className={s.form}>{(['basic','housing','transport'] as const).map(key=><label key={key} className={s.field}><span>{titles[key]}</span><select multiple size={5} disabled={!data.canSettings} value={mapping[key]} onChange={e=>onChange({...value,mudad:{...mapping,[key]:Array.from(e.target.selectedOptions,o=>o.value)}})}>{key==='basic'&&<option value="basic">الراتب الأساسي في العقد</option>}{data.components.filter(c=>c.active&&c.kind==='earning'&&!c.referenceOnly).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>)}</div></div></section>;
}
