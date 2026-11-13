import {z} from 'zod';
import {reportCatalog,reportFields,reportNumericFields,reportSourceFields,type ReportField} from './report-catalog';

export type ReportColumnKey=ReportField|`${string}.${string}`;
export type ReportRelationEdge={source:string;key:string;target:string;label:string;cardinality:'one'|'many';sourceKey:string;targetKey:string};
export type ReportRelationChoice={path:string;label:string;target:string;cardinality:'one'|'many';parentPath?:string};
export type ResolvedReportField={key:ReportColumnKey;label:string;numeric:boolean;baseField?:ReportField};
export const relationExtraSources=[
  {id:'branch-directory',title:'الفروع المرتبطة',domain:'branches',columns:['name','number','city','phone','status']},
  {id:'item-directory',title:'أصناف المخزون',domain:'inventory',columns:['name','number','unit','status']},
  {id:'warehouse-directory',title:'المستودعات',domain:'inventory',columns:['name','status']},
  {id:'customer-categories',title:'تصنيفات العملاء',domain:'customers',columns:['name','note','status']},
  {id:'customer-statuses',title:'حالات متابعة العملاء',domain:'customers',columns:['name','note','status']},
  {id:'price-lists',title:'قوائم أسعار العملاء',domain:'customers',columns:['name','status']},
  {id:'department-directory',title:'أقسام الموظفين',domain:'organization',columns:['name','number','status']},
] as const;
const edges:ReportRelationEdge[]=[];
function edge(source:string,key:string,target:string,label:string,cardinality:'one'|'many',sourceKey:string,targetKey='id'){edges.push({source,key,target,label,cardinality,sourceKey,targetKey});}
for(const source of ['sales','business-sales','sales-lines','sales-payments','customer-balances','customer-aging','customer-credits','journal','cash-flow','expenses','receipts','credit-charges','credit-usages','memberships','membership-renewals','workflows','work-orders','bookings','installments','rental-installments'])edge(source,'customer','customers','العميل','one','customerId');
for(const source of ['purchase-documents','purchase-lines','purchase-payments','supplier-balances','supplier-aging','journal','expenses','receipts'])edge(source,'supplier','suppliers','المورد','one','supplierId');
for(const [key,target,label] of [['invoices','business-sales','فواتير الأعمال'],['taxInvoices','sales','الفواتير الضريبية'],['payments','sales-payments','التحصيلات'],['memberships','memberships','العضويات'],['renewals','membership-renewals','التجديدات'],['charges','credit-charges','شحن الخدمة'],['usages','credit-usages','استهلاك الخدمة'],['orders','work-orders','أوامر الشغل'],['workflows','workflows','دورات العمل'],['bookings','bookings','المواعيد'],['installments','installments','الأقساط']] as const)edge('customers',key,target,label,'many','id','customerId');
for(const [key,target,label] of [['invoices','purchase-documents','فواتير المورد'],['payments','purchase-payments','دفعات المورد']] as const)edge('suppliers',key,target,label,'many','id','supplierId');
edge('customers','categories','customer-categories','تصنيفات العميل','many','categoryIds');
edge('customers','followupStatus','customer-statuses','حالة المتابعة','one','statusId');
edge('customers','priceList','price-lists','قائمة الأسعار الافتراضية','one','priceListId');
edge('customers','employee','employees','الموظف المسؤول','one','assignedUserId','userId');
for(const source of ['customers','suppliers','item-directory','accounts'])edge(source,'branches','branch-directory','الفروع المخصصة','many','branchIds');
for(const source of ['sales','business-sales','purchase-documents']){edge(source,'lines',source==='purchase-documents'?'purchase-lines':'sales-lines','البنود','many','id','documentId');edge(source,'payments',source==='purchase-documents'?'purchase-payments':'sales-payments','الحركات النقدية','many','id','invoiceId');}
edge('sales-lines','invoice','sales','الفاتورة الأصلية','one','invoiceId');edge('purchase-lines','invoice','purchase-documents','فاتورة الشراء','one','invoiceId');
edge('sales-payments','invoice','sales','الفاتورة المحصلة','one','invoiceId');edge('purchase-payments','invoice','purchase-documents','الفاتورة المسددة','one','invoiceId');
for(const source of ['sales-lines','purchase-lines','stock','stock-aging','stock-turnover','stock-movements','stock-requests']){edge(source,'item','item-directory','صنف المخزون','one','productId');edge(source,'warehouse','warehouse-directory','المستودع','one','warehouseId');}
for(const source of ['stock','stock-movements','stock-requests']){edge('item-directory',source==='stock'?'balances':source==='stock-movements'?'movements':'requests',source,source==='stock'?'أرصدة المستودعات':source==='stock-movements'?'حركات المخزون':'أذون المخزون','many','id','productId');}
for(const source of ['journal','cash-flow','sales-payments','purchase-payments','expenses','receipts'])edge(source,'account','accounts','الحساب','one','accountId');
edge('accounts','entries','journal','حركات الحساب','many','id','accountId');
for(const source of ['attendance','employee-documents','employee-compliance','leave-balance','contracts','payslips','loans'])edge(source,'employee','employees','الموظف','one','employeeId');
for(const [key,target,label] of [['attendance','attendance','أيام الحضور'],['documents','employee-documents','وثائق الموظف'],['leave','leave-balance','أرصدة الإجازات'],['contracts','contracts','عقود المرتب'],['payslips','payslips','قسائم المرتبات'],['loans','loans','السلف']] as const)edge('employees',key,target,label,'many','id','employeeId');
edge('employees','department','department-directory','القسم','one','departmentId');
for(const source of ['employees','attendance','contracts','payslips','loans','bookings','sales','business-sales','purchase-documents','sales-lines','purchase-lines','journal'])edge(source,'branch','branch-directory','الفرع المسجل','one','branchId');
edge('department-directory','employees','employees','موظفو القسم','many','id','departmentId');
edge('branch-directory','employees','employees','موظفو الفرع','many','id','branchId');
edge('manufacturing','item','item-directory','الصنف الناتج','one','productId');
edge('manufacturing','warehouse','warehouse-directory','مستودع الإنتاج','one','warehouseId');
export const reportRelationEdges:readonly ReportRelationEdge[]=edges;
export const reportColumnSchema=z.string().min(1).max(180).regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*){0,5}$/).transform(v=>v as ReportColumnKey);
export const reportRelationPathsSchema=z.array(z.string().max(120).regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*){0,2}$/)).max(8).refine(v=>new Set(v).size===v.length);
export function resolveReportRelation(source:string,path:string){let target=source;let many=false;const visited=new Set([source]);const labels:string[]=[];for(const key of path.split('.')){const e=edges.find(v=>v.source===target&&v.key===key);if(!e||visited.has(e.target))return null;visited.add(e.target);target=e.target;many ||= e.cardinality==='many';labels.push(e.label);}return{target,cardinality:many?'many' as const:'one' as const,label:labels.join(' / ')};}
export function availableReportRelations(source:string,paths:readonly string[]):ReportRelationChoice[]{return ['',...paths].flatMap(parentPath=>{const p=parentPath?resolveReportRelation(source,parentPath):{target:source,cardinality:'one' as const,label:''};if(!p||parentPath.split('.').filter(Boolean).length>=3)return[];return edges.filter(e=>e.source===p.target).flatMap(e=>{const path=parentPath?`${parentPath}.${e.key}`:e.key;const found=resolveReportRelation(source,path);return !found||paths.includes(path)?[]:[{path,label:found.label,target:found.target,cardinality:found.cardinality,...(parentPath?{parentPath}:{})}];});});}
export function relationSourceFields(source:string):ReportField[]{const extra=relationExtraSources.find(v=>v.id===source);return [...new Set<ReportField>([...(extra?[...extra.columns]:[...reportCatalog.filter(v=>v.source===source).flatMap(v=>[...v.columns,v.groupBy]),...(reportSourceFields[source as keyof typeof reportSourceFields]??[])]),'count','date','year','quarter','month','week'])];}
export function isNumericReportColumn(key:string){if(key.includes('.'))return /\.(sum|min|max)\.[^.]+$/.test(key)||key.endsWith('.count')||!key.includes('.list.')&&reportNumericFields.includes(key.split('.').at(-1) as ReportField);return reportNumericFields.includes(key as ReportField);}
const aggregateLabels={sum:'مجموع',min:'أدنى',max:'أعلى',list:'قائمة'} as const;
export function columnLabel(key:string,source?:string){if(!key.includes('.'))return reportFields[key as ReportField]??key;const parts=key.split('.');const field=parts.pop() as ReportField;const op=parts.at(-1) as keyof typeof aggregateLabels;if(op in aggregateLabels)parts.pop();const names=(source?resolveReportRelation(source,parts.join('.'))?.label:null)??parts.map(k=>edges.find(e=>e.key===k)?.label??k).join(' / ');return `${names} / ${op in aggregateLabels?aggregateLabels[op]+' ':''}${reportFields[field]??field}`;}
export function resolveReportFields(source:string,baseFields:readonly ReportField[],paths:readonly string[],sourceColumns?:Readonly<Record<string,readonly ReportField[]>>):ResolvedReportField[]{const result:ResolvedReportField[]=baseFields.map(key=>({key,label:reportFields[key],numeric:isNumericReportColumn(key),baseField:key}));for(const path of paths){const p=resolveReportRelation(source,path);if(!p)continue;const fields=sourceColumns?.[p.target]??relationSourceFields(p.target);if(p.cardinality==='many')result.push({key:`${path}.count`,label:`${p.label} / العدد`,numeric:true,baseField:'count'});for(const field of fields){if(p.cardinality==='one'){result.push({key:`${path}.${field}`,label:`${p.label} / ${reportFields[field]}`,numeric:isNumericReportColumn(field),baseField:field});continue;}if(field==='count')continue;for(const op of reportNumericFields.includes(field)?['sum','min','max'] as const:['list'] as const)result.push({key:`${path}.${op}.${field}`,label:`${p.label} / ${aggregateLabels[op]} ${reportFields[field]}`,numeric:op!=='list',baseField:field});}}return result;}
export function validReportRelationPaths(source:string,paths:readonly string[]){return paths.length<=8&&new Set(paths).size===paths.length&&paths.every(p=>p.split('.').length<=3&&resolveReportRelation(source,p)!==null&&(p.includes('.')?paths.includes(p.slice(0,p.lastIndexOf('.'))):true));}
