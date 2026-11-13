"use client";
import {hrName,type HrEmployee,type HrSnapshot} from '@/lib/erp/hr';
import {TemplatePrintChooser} from '@/components/erp/templates/template-print-chooser';
export function EmployeePrint({employee:e,data,slug}:{employee:HrEmployee;data:HrSnapshot;slug:string}){
 const rows=[['الاسم',hrName(e)],['الكود',e.code],['الحالة',e.active?'نشط':'غير نشط'],['تاريخ الالتحاق',e.joinDate],['البريد الإلكتروني',e.email],['الجوال',e.mobile],['القسم',data.organization.find(o=>o.id===e.departmentId)?.name||'—'],['المسمى الوظيفي',data.organization.find(o=>o.id===e.designationId)?.name||'—'],['الفرع',data.branches.find(b=>b.id===e.branchId)?.name||'—'],['المدير المباشر',data.managers.find(m=>m.id===e.managerId)?.name||'—']];
 return <TemplatePrintChooser kind="employee" slug={slug} values={{'العلامة':data.cafeName??slug,'العنوان':'ملف الموظف','الموظف':hrName(e),'رقم_المستند':e.code,'التاريخ':e.joinDate,'البريد':e.email,'الجوال':e.mobile}} table={{head:['البيان','القيمة'],rows}}/>;
}
