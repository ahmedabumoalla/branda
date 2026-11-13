"use client";
import {payrollExportRows} from '@/lib/erp/payroll-export';
import type {PayrollRecord,PayrollSnapshot} from '@/lib/erp/payroll';
import s from '../erp.module.css';
export function PayrollMappedExport({data,records}:{data:PayrollSnapshot;records:PayrollRecord[]}){
 const rows=payrollExportRows(data,records);
 return <button type="button" className={s.button} disabled={!rows.length} onClick={()=>{
  const csv=[['كود الموظف','الموظف','رقم القسيمة','من','إلى','العملة','الراتب الأساسي','بدل السكن','بدل النقل','صافي الراتب'],...rows].map(row=>row.map(v=>'"'+v.replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='payroll-mapped-data.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }}>تصدير بيانات الرواتب حسب تعيين مدد</button>;
}
