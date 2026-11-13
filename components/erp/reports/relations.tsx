'use client';
import {useState} from 'react';
import type {ReportsSnapshot,ReportQuery} from '@/lib/erp/reports';
import {resolveReportRelation} from '@/lib/erp/report-relations';
import {removeReportRelation,reportRelationAllowed,reportRelationOptions,updateReportRelations} from '@/lib/erp/report-builder-state';
import s from '../erp.module.css';
import css from './report.module.css';

export function ReportRelations({data,query,onChange}:{data:ReportsSnapshot;query:ReportQuery;onChange:(query:ReportQuery)=>void}){
 const [choice,setChoice]=useState('');
 const paths=query.relationPaths??[],options=reportRelationOptions(data,query),limit=Math.min(8,data.relations?.maxPaths??8);
 const selected=options.find(o=>o.path===choice);
 return <div className={css.relations}>
  <h3>مصادر البيانات المرتبطة</h3>
  <p className={s.muted}>أضف بيانات مرتبطة بالمصدر الرئيسي أو بعلاقة أخرى مع إبقاء كل عملية أصلية مرة واحدة</p>
  {paths.map(path=>{
   const relation=resolveReportRelation(query.source,path),allowed=reportRelationAllowed(data,query.source,path);
   return <div className={css.relationRow} key={path} style={{paddingInlineStart:`${Math.max(0,path.split('.').length-1)*16}px`}}>
    <div><strong>{relation?.label??path}</strong><p className={s.muted}>{!allowed?'لم تعد هذه العلاقة متاحة بصلاحياتك الحالية':relation?.cardinality==='many'?'عدة سجلات مرتبطة تعرض كقائمة أو عدد أو مجموع':'بيانات السجل المرتبط'}</p></div>
    <button type="button" className={s.danger} onClick={()=>{onChange(removeReportRelation(data,query,path));setChoice('');}} aria-label={`إزالة علاقة ${relation?.label??path}`}>إزالة</button>
   </div>;
  })}
  <div className={css.relationAdd}>
   <label className={s.field}><span>العلاقة</span><select value={selected?.path??''} onChange={e=>setChoice(e.target.value)} disabled={paths.length>=limit||!options.length}><option value="">اختر بيانات مرتبطة</option>{options.map(o=><option key={o.path} value={o.path}>{o.label}</option>)}</select></label>
   <button type="button" className={s.button} disabled={!selected||paths.length>=limit} onClick={()=>{if(selected){onChange(updateReportRelations(data,query,[...paths,selected.path]));setChoice('');}}}>إضافة علاقة</button>
  </div>
  {paths.length>=limit?<p role="status" className={s.muted}>وصلت إلى الحد الأقصى للعلاقات في التقرير</p>:!options.length&&<p className={s.muted}>لا توجد علاقات إضافية متاحة لهذا المصدر ضمن صلاحياتك</p>}
  {!!paths.length&&<p className={s.muted}>تظهر حقول العلاقات في الأعمدة والشروط والتجميع وتحتسب مجاميع السجلات المرتبطة دون تكرار السجل نفسه</p>}
 </div>;
}
