'use client';
import {columnLabel,isNumericReportColumn,type ReportColumnKey} from '@/lib/erp/report-relations';

import type {Dispatch,SetStateAction} from 'react';
import type {ReportQuery} from '@/lib/erp/reports';
import s from '../erp.module.css';
import css from './report.module.css';
export function ReportGrouping({fields,query,setQuery}:{fields:ReportColumnKey[];query:ReportQuery;setQuery:Dispatch<SetStateAction<ReportQuery>>}){
 const available=fields.filter(f=>!isNumericReportColumn(f));
 return <section className={s.panel}><h2 className={s.panelTitle}>مستويات التجميع</h2><div className={`${s.body} ${s.form}`}><p className={s.muted}>اختر حتى أربعة مستويات بالترتيب لعرض ملخص التقرير</p>{query.groupBy.map((field,index)=><div key={index} className={css.condition}><label className={s.field}><span>المستوى {index+1}</span><select value={field} onChange={e=>setQuery(q=>({...q,groupBy:q.groupBy.map((f,i)=>i===index?e.target.value as ReportColumnKey:f)}))}>{available.filter(f=>f===field||!query.groupBy.includes(f)).map(f=><option key={f} value={f}>{columnLabel(f,query.source)}</option>)}</select></label><button type="button" className={s.danger} aria-label={`حذف مستوى التجميع ${index+1}`} onClick={()=>setQuery(q=>({...q,groupBy:q.groupBy.filter((_,i)=>i!==index)}))}>حذف المستوى</button></div>)}<button type="button" className={s.button} disabled={query.groupBy.length>=4||available.every(f=>query.groupBy.includes(f))} onClick={()=>setQuery(q=>{const next=available.find(f=>!q.groupBy.includes(f));return next?{...q,groupBy:[...q.groupBy,next]}:q;})}>إضافة مستوى تجميع</button></div></section>;
}
