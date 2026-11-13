"use client";
import {assetLabels,type AssetRecord,type AssetSnapshot} from "@/lib/erp/assets";
import {TemplatePrintChooser} from "@/components/erp/templates/template-print-chooser";
export function AssetPrint({record:r,snapshot:s}:{record:AssetRecord;snapshot:AssetSnapshot}){
 const n=(v:number)=>Number(v).toLocaleString("ar-SA",{maximumFractionDigits:2});
 const rows=[["الحالة",assetLabels[r.status]],["تاريخ الاقتناء",r.acquired_on],["الكمية",String(r.quantity)],["الكمية المتبقية",String(r.remaining_quantity)],["تكلفة الشراء",n(r.purchase_cost)],["قيمة الأصل الإجمالية",n(r.gross_value)],["مجمع الإهلاك",n(r.accumulated_depreciation)],["صافي القيمة الدفترية",n(Number(r.gross_value)-Number(r.accumulated_depreciation))],["القيمة التخريدية",n(r.residual_value)],["العمر الإنتاجي بالشهور",String(r.useful_life_months)]];
 return <TemplatePrintChooser kind="asset" slug={s.slug} values={{"العلامة":s.cafeName,"العنوان":r.name,"رقم_المستند":r.code,"التاريخ":r.acquired_on,"الوصف":r.payload.description,"المبلغ":n(Number(r.gross_value)-Number(r.accumulated_depreciation)),"الكمية":r.remaining_quantity}} table={{head:["البيان","القيمة"],rows}}/>;
}
