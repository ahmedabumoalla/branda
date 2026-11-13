import {z} from 'zod';
import type {FinanceSnapshot} from '@/lib/finance/brand-finance';
const id=z.uuid(),revision=z.number().int().min(0),name=z.string().trim().min(1).max(160),money=z.number().finite().min(0).max(1e7).multipleOf(.01);
export const timeSourceKinds=['none','work_order','workflow','task','contracting_project'] as const;
export const timeEntrySchema=z.object({id,revision,workerKind:z.enum(['user','employee']),workerId:id,projectId:id,activityId:id,start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true}),note:z.string().max(5000),billable:z.boolean(),sourceKind:z.enum(timeSourceKinds),sourceId:id.nullable()}).refine(v=>Date.parse(v.end)>Date.parse(v.start)&&Date.parse(v.end)-Date.parse(v.start)<=86400000,'أدخل فترة صحيحة لا تتجاوز أربعًا وعشرين ساعة').refine(v=>v.sourceKind==='none'?!v.sourceId:Boolean(v.sourceId),'اختر السجل المرتبط');
export type TimeEntryInput=z.infer<typeof timeEntrySchema>;
export type TimeEntry=Omit<TimeEntryInput,'end'>&{end:string|null;seconds:number;costRate:number;billingRate:number;workerName:string;projectName:string;activityName:string;customerId:string|null;batchId:string|null;invoiceId:string|null;createdAt:string};
export const timeCatalogSchema=z.object({id,revision,kind:z.enum(['project','activity']),name,active:z.boolean(),customerId:id.nullable(),rate:money,description:z.string().max(2000)});
export type TimeCatalog=z.infer<typeof timeCatalogSchema>;
export const timeSettingsSchema=z.object({revision,includeWages:z.boolean(),defaultBillingRate:money,defaultCostRate:money});
export const timeRateSchema=z.object({id,revision,workerKind:z.enum(['user','employee']),workerId:id,costRate:money,billingRate:money,effectiveFrom:z.iso.date()});
export type TimeRate=z.infer<typeof timeRateSchema>;
export const timeInvoiceSchema=z.object({ids:z.array(id).min(1).max(200),customerId:id,group:z.enum(['project','activity','worker','date']),format:z.enum(['grouped','detailed']),description:z.array(z.enum(['project','activity','worker','date','note'])).max(5),defaultRate:money,overrideRate:z.boolean(),taxRate:z.number().finite().min(0).max(100),taxReason:z.string().max(250)});
export type TimeInvoiceInput=z.infer<typeof timeInvoiceSchema>;
export const timeCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('entry'),payload:timeEntrySchema}),z.object({action:z.literal('start'),payload:z.object(timeEntrySchema.shape).omit({start:true,end:true})}),
 z.object({action:z.enum(['stop','delete']),payload:z.object({id,revision})}),z.object({action:z.literal('catalog'),payload:timeCatalogSchema}),z.object({action:z.literal('delete_catalog'),payload:z.object({id,revision})}),
 z.object({action:z.literal('settings'),payload:timeSettingsSchema}),z.object({action:z.literal('rate'),payload:timeRateSchema}),z.object({action:z.literal('delete_rate'),payload:z.object({id,revision})}),
 z.object({action:z.literal('invoice'),payload:timeInvoiceSchema}),z.object({action:z.literal('cancel_invoice'),payload:z.object({id,revision})}),
 z.object({action:z.literal('import'),payload:z.object({rows:z.array(timeEntrySchema).min(1).max(100)})})
]);
export type TimeCommand=z.infer<typeof timeCommandSchema>;
export type TimeSnapshot={entries:TimeEntry[];catalogs:TimeCatalog[];rates:TimeRate[];settings:z.infer<typeof timeSettingsSchema>;workers:{id:string;kind:'user'|'employee';name:string;active:boolean;userId?:string|null}[];batches:{id:string;revision:number;draftId:string;invoiceId:string|null;status:'draft'|'issued'|'cancelled';createdAt:string;total:number}[];sources:{id:string;kind:typeof timeSourceKinds[number];name:string;customerId:string|null;href?:string}[];events:{id:string;action:string;at:string;recordId:string|null}[];finance:FinanceSnapshot;canCreate:boolean;canUpdate:boolean;canDelete:boolean;canApprove:boolean;canConfigure:boolean;slug:string;brand:string;serverNow:string};
export function timeDuration(seconds:number){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60);return`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;}
export function timeWeek(date:string,weekStart=0){const first=new Date(date+'T00:00:00Z');first.setUTCDate(first.getUTCDate()-(first.getUTCDay()-weekStart+7)%7);return Array.from({length:7},(_,i)=>new Date(first.getTime()+i*86400000).toISOString().slice(0,10));}
export function newTimeEntry(snapshot:TimeSnapshot,date=new Date().toISOString().slice(0,10)):TimeEntryInput{const worker=snapshot.workers.find(x=>x.userId===snapshot.finance.userId||x.kind==='user'&&x.id===snapshot.finance.userId)??snapshot.workers[0];return{id:crypto.randomUUID(),revision:0,workerKind:worker?.kind??'user',workerId:worker?.id??'',projectId:snapshot.catalogs.find(x=>x.kind==='project'&&x.active)?.id??'',activityId:snapshot.catalogs.find(x=>x.kind==='activity'&&x.active)?.id??'',start:date+'T09:00:00+03:00',end:date+'T10:00:00+03:00',note:'',billable:true,sourceKind:'none',sourceId:null};}
