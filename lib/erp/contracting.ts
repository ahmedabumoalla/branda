import { z } from "zod";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";

export const contractingKinds = ["bid", "project", "cost_sheet", "quotation", "contract", "certificate", "reverse_certificate", "work_item"] as const;
export type ContractingKind = typeof contractingKinds[number];
export const contractingSections = [
  { key:"bids",kind:"bid",label:"المناقصات",single:"مناقصة" },
  { key:"projects",kind:"project",label:"المشاريع",single:"مشروع مقاولات" },
  { key:"cost-sheets",kind:"cost_sheet",label:"جداول التكاليف",single:"جدول تكاليف" },
  { key:"quotations",kind:"quotation",label:"عروض أسعار المقاولات",single:"عرض سعر مقاولات" },
  { key:"contracts",kind:"contract",label:"العقود",single:"عقد" },
  { key:"certificates",kind:"certificate",label:"المستخلصات",single:"مستخلص" },
  { key:"reverse-certificates",kind:"reverse_certificate",label:"المستخلصات العكسية",single:"مستخلص عكسي" },
  { key:"work-items",kind:"work_item",label:"قوالب بنود الأعمال",single:"قالب بند أعمال" },
] as const;
const uuid = z.uuid().nullable();
const money = z.number().finite().min(0).max(1e9);
const rate = z.number().finite().min(0).max(100);
const date = z.union([z.iso.date(),z.literal("")]);
export const contractingResourceSchema = z.object({ id:z.uuid(), item_id:uuid, kind:z.enum(["material","labor"]), name:z.string().trim().min(1).max(160),unit:z.string().trim().min(1).max(30),consumption:money,unit_cost:money }).strict();
export const contractingLineSchema = z.object({id:z.uuid(),source_line_id:uuid,parent_id:uuid,kind:z.enum(["heading","subheading","work"]),name:z.string().trim().min(1).max(160),unit:z.string().trim().max(30),quantity:money,unit_price:money,markup:money,tax_rate:rate,note:z.string().max(1000),resources:z.array(contractingResourceSchema).max(100)}).strict();
export type ContractingLine = z.infer<typeof contractingLineSchema>;
export type ContractingResource = z.infer<typeof contractingResourceSchema>;
export const contractingDocumentSchema = z.object({
  id:z.uuid(),kind:z.enum(contractingKinds),title:z.string().trim().min(1).max(160),number:z.string().trim().max(40),revision:z.number().int().min(0),
  customer_id:uuid,project_id:uuid,source_id:uuid,description:z.string().max(5000),start_date:date,end_date:date,date,valid_until:date,
  budget:money,retention_rate:rate,advance_amount:money,recovery_rate:rate,duration:money,duration_unit:z.enum(["days","weeks","months","years"]),
  cost_center:z.string().trim().max(160),tags:z.string().max(500),assigned_users:z.array(z.uuid()).max(50),active:z.boolean(),is_default:z.boolean(),
  followup_status:z.string().max(80),custom_fields:z.record(z.string().max(80),z.string().max(2000)),lines:z.array(contractingLineSchema).max(100),
}).strict().superRefine((d,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if(d.start_date&&d.end_date&&d.end_date<d.start_date)issue("تاريخ الانتهاء يسبق تاريخ البدء");
  if(d.kind!=="work_item"&&!d.customer_id)issue("اختر العميل");
  if(d.kind==="project"&&!d.cost_center)issue("أدخل مركز التكلفة الرئيسي");
  if(d.kind!=="project"&&!d.lines.some(l=>l.kind==="work"&&l.quantity>0))issue("أضف بند أعمال وكمية أكبر من صفر");
  if(d.kind==="certificate"&&!d.source_id)issue("اختر العقد النشط");if(d.kind==="reverse_certificate"&&!d.source_id)issue("اختر المستخلص المفوتر");
  if(d.kind==="reverse_certificate"&&d.lines.some(l=>l.kind!=="work"||!l.source_line_id||l.quantity<=0||Math.abs(l.quantity*1000-Math.round(l.quantity*1000))>0.00001))issue("اختر بنود المستخلص والكميات العكسية بحد ثلاث منازل عشرية");
  const ids=new Set(d.lines.map(l=>l.id));if(ids.size!==d.lines.length)issue("تكررت معرفات البنود");
  for(const l of d.lines){if(l.parent_id&&(!ids.has(l.parent_id)||l.parent_id===l.id))issue("راجع ترتيب البنود الرئيسية والفرعية");if(l.kind==="work"&&!l.unit)issue("حدد وحدة بند الأعمال");}
});
export type ContractingInput = z.infer<typeof contractingDocumentSchema>;
export type ContractingDocument = ContractingInput & {status:"draft"|"issued"|"approved"|"active"|"closed"|"cancelled"|"rejected";subtotal:number;tax:number;total:number;cost:number;retention:number;recovery:number;net_due:number;credit_note_id?:string|null;credit_document_id?:string|null;credit_allocation_id?:string|null;reversible_quantities?:Record<string,number>;invoice_id:string|null;invoice_draft_id:string|null;created_at:string;updated_at:string};
const named=z.object({id:z.uuid(),name:z.string().trim().min(1).max(80),active:z.boolean()}).strict();
export const contractingSettingsSchema=z.object({revision:z.number().int().min(0),numbering:z.record(z.enum(contractingKinds),z.number().int().min(1).max(999999999)),price_mode:z.enum(["average","purchase"]),alert_mode:z.enum(["percent","days"]),alert_threshold:z.number().min(0).max(365),statuses:z.array(named.extend({type:z.enum(["open","closed"]),color:z.string().regex(/^#[0-9a-fA-F]{6}$/)})).max(50),actions:z.array(named.extend({description:z.string().max(500)})).max(50),fields:z.array(named.extend({type:z.enum(["text","number","date","textarea"]),required:z.boolean()})).max(50),print_footer:z.string().max(3000)}).strict();
export type ContractingSettings=z.infer<typeof contractingSettingsSchema>;
export type ContractingActivity={id:string;project_id:string;kind:"appointment"|"time"|"action";title:string;note:string;starts_at:string;ends_at:string;staff_id:string|null;status:"planned"|"done"|"cancelled";revision:number};
export type ContractingSnapshot={forms?:import('./contracting-forms').ContractingFormsSnapshot;documents:ContractingDocument[];settings:ContractingSettings;events:{id:string;document_id:string;action:string;note:string;at:string}[];links:{project_id:string;document_id:string;relation:string;amount:number}[];activities:ContractingActivity[];drafts:{project_id:string;draft_id:string;kind:"invoice"|"advance"}[];finance:FinanceSnapshot;canWrite:boolean;canApprove?:boolean;canSettings:boolean};
export const contractingStatus:Record<string,string>={draft:"مسودة",issued:"مصدر",approved:"معتمد",active:"نشط",closed:"مغلق",cancelled:"ملغى",rejected:"مرفوض"};
export function contractingPath(kind:ContractingKind,id?:string){return `/dashboard/system/contracting/${contractingSections.find(s=>s.kind===kind)!.key}${id?`/${id}`:""}`;}
export const roundContracting=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function contractingTotals(lines:ContractingLine[],retentionRate=0,recoveryRate=0,remainingAdvance=Infinity){let subtotal=0,tax=0,cost=0;for(const l of lines.filter(l=>l.kind==="work")){const net=roundContracting(l.quantity*l.unit_price);subtotal+=net;tax+=roundContracting(net*l.tax_rate/100);cost+=roundContracting(l.quantity*l.resources.reduce((n,r)=>n+r.consumption*r.unit_cost,0));}subtotal=roundContracting(subtotal);tax=roundContracting(tax);const total=roundContracting(subtotal+tax),retention=roundContracting(subtotal*retentionRate/100),recovery=roundContracting(Math.min(subtotal*recoveryRate/100,remainingAdvance));return{subtotal,tax,cost:roundContracting(cost),total,retention,recovery,net_due:roundContracting(total-retention-recovery)};}
export function reversedQuantity(documents:ContractingDocument[],certificateId:string,lineId:string){return documents.filter(d=>d.kind==="reverse_certificate"&&d.source_id===certificateId&&d.status==="approved").reduce((n,d)=>n+d.lines.filter(l=>l.source_line_id===lineId).reduce((sum,l)=>sum+l.quantity,0),0);}
export function reversibleQuantity(documents:ContractingDocument[],source:ContractingDocument,lineId:string){return source.reversible_quantities?.[lineId]??Math.max(0,(source.lines.find(l=>l.id===lineId)?.quantity??0)-reversedQuantity(documents,source.id,lineId));}
export function completedQuantity(documents:ContractingDocument[],contractId:string,lineId:string,exclude?:string){return documents.filter(d=>d.kind==="certificate"&&d.source_id===contractId&&d.id!==exclude&&d.status==="approved").reduce((n,d)=>n+d.lines.filter(l=>l.source_line_id===lineId).reduce((sum,l)=>sum+l.quantity-reversedQuantity(documents,d.id,l.id),0),0);}
export function recoveredAdvance(documents:ContractingDocument[],contractId:string,exclude?:string){const certificates=documents.filter(d=>d.kind==="certificate"&&d.source_id===contractId&&d.id!==exclude&&d.status==="approved");return certificates.reduce((n,d)=>n+d.recovery-documents.filter(r=>r.kind==="reverse_certificate"&&r.source_id===d.id&&r.status==="approved").reduce((v,r)=>v+r.recovery,0),0);}

export function newContractingDocument(kind:ContractingKind,vat=15):ContractingInput{return{id:crypto.randomUUID(),kind,title:"",number:"",revision:0,customer_id:null,project_id:null,source_id:null,description:"",start_date:"",end_date:"",valid_until:"",date:new Date().toISOString().slice(0,10),budget:0,retention_rate:0,advance_amount:0,recovery_rate:0,duration:0,duration_unit:"months",cost_center:"",tags:"",assigned_users:[],active:true,is_default:false,followup_status:"",custom_fields:{},lines:kind==="project"?[]:[newContractingLine("work",vat)]};}
export function newContractingLine(kind:ContractingLine["kind"],vat=15):ContractingLine{return{id:crypto.randomUUID(),source_line_id:null,parent_id:null,kind,name:"",unit:"وحدة",quantity:kind==="work"?1:0,unit_price:0,markup:0,tax_rate:vat,note:"",resources:[]};}
