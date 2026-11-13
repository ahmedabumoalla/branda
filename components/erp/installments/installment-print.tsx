"use client";
import {DocumentTemplatePrint} from "@/components/erp/templates/document-template-print";
import type {InstallmentDetail,InstallmentTemplate,InstallmentRow} from "@/lib/erp/installments";
export function InstallmentPrint({record,template,brand,row,slug}:{record:InstallmentDetail;template:InstallmentTemplate;brand:string;row?:InstallmentRow;slug:string}){
 const a=record.agreement,values:Record<string,string>={'العلامة':brand,'العميل':a.customerName,'العنوان':row?`قسط رقم ${row.number}`:`اتفاقية تقسيط فاتورة ${a.invoiceNumber}`,'رقم_المستند':a.invoiceNumber,'رقم_الفاتورة':a.invoiceNumber,'المبلغ':a.total.toFixed(2),'المدفوع':a.paid.toFixed(2),'المتبقي':a.outstanding.toFixed(2),'تاريخ_البدء':a.schedule?.start??'','التاريخ':a.schedule?.start??'','تاريخ_الاستحقاق':row?.date??a.nextDue??'','رقم_القسط':String(row?.number??''),'مبلغ_القسط':(row?.amount??a.schedule?.amount??0).toFixed(2),'الوصف':a.schedule?.note??''};
 const table={head:['القسط','الاستحقاق','القيمة','المدفوع','المتبقي'],rows:(row?[row]:record.rows).map(r=>[String(r.number),r.date,r.amount.toFixed(2),r.paid.toFixed(2),r.remaining.toFixed(2)])};
 return <DocumentTemplatePrint template={template} values={values} table={table} slug={slug}/>;
}
