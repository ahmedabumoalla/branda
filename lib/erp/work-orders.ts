import {z} from 'zod';
import {erpCustomFieldsSchema,type ErpCustomField,type ErpFieldSources} from './custom-fields';
import type {FinanceSnapshot} from '@/lib/finance/brand-finance';
const id=z.uuid(),revision=z.number().int().min(0),text=z.string().trim().max(20000),money=z.number().finite().min(0).max(1e9).multipleOf(.01);
export const workStateSchema=z.object({id:z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),name:z.string().trim().min(1).max(100),closed:z.boolean(),color:z.string().regex(/^#[a-fA-F0-9]{6}$/)});
export const workSettingsSchema=z.object({revision,nextNumber:z.number().int().min(1).max(999999999),budgetMode:z.enum(['expense','invoice']),statuses:z.array(workStateSchema).min(1).max(50),actions:z.array(z.object({id,name:z.string().trim().min(1).max(150)})).max(100),fields:erpCustomFieldsSchema,shareEnabled:z.boolean(),shareMessage:z.string().max(2000)}).refine(v=>new Set(v.statuses.map(s=>s.id)).size===v.statuses.length);
export const workOrderSchema=z.object({id,revision,title:z.string().trim().min(1).max(160),code:z.string().trim().max(80),start:z.iso.date(),end:z.iso.date().nullable(),customerId:id.nullable(),description:text,tags:z.array(z.string().trim().min(1).max(60)).max(20),budget:money,staffIds:z.array(id).max(100),customValues:z.record(z.string(),z.unknown()),draft:z.boolean()}).refine(v=>!v.end||v.end>=v.start);
export const workActivitySchema=z.object({id,revision,orderId:id,title:z.string().trim().min(1).max(160),note:text,start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true}),staffIds:z.array(id).max(100),status:z.enum(['planned','done','cancelled']),actionId:id.nullable(),repeatCount:z.number().int().min(1).max(52),repeatDays:z.number().int().min(1).max(365),shared:z.boolean()}).refine(v=>v.end>v.start);
const base={id,revision};
export const workCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),payload:workOrderSchema}),z.object({action:z.literal('settings'),payload:workSettingsSchema}),z.object({action:z.literal('activity'),payload:workActivitySchema}),
 z.object({action:z.enum(['delete','copy']),payload:z.object(base)}),z.object({action:z.literal('status'),payload:z.object({...base,status:z.string().max(60)})}),
 z.object({action:z.literal('note'),payload:z.object({...base,note:text.min(1),occurredAt:z.iso.datetime({offset:true}),status:z.string().max(60).optional(),actionId:id.nullable()})}),
 z.object({action:z.enum(['link','unlink']),payload:z.object({...base,kind:z.enum(['document','quotation','credit_note','task']),targetId:id})}),
 z.object({action:z.literal('financial'),payload:z.object({...base,operation:z.enum(['purchase','treasury','stock_adjust','stock_transfer','journal','refund','settlement']),values:z.record(z.string(),z.unknown())})}),
 z.object({action:z.literal('debit'),payload:z.object({...base,sourceId:id,amount:money.refine(v=>v>0),taxRate:z.number().min(0).max(100),description:z.string().trim().min(3).max(500),reason:z.string().trim().min(1).max(250)})}),
 z.object({action:z.literal('advance'),payload:z.object({...base,accountId:id,amount:money.refine(v=>v>0),note:text})}),
 z.object({action:z.literal('invoice'),payload:z.object({...base,amount:money.refine(v=>v>0),taxRate:z.number().min(0).max(100),taxReason:z.string().max(250)})}),
 z.object({action:z.literal('task'),payload:z.object({...base,title:z.string().min(1).max(160),typeId:id,assigneeId:id,dueDate:z.iso.date().nullable(),note:text})})
]);
export type WorkCommand=z.infer<typeof workCommandSchema>;
export type WorkInput=z.infer<typeof workOrderSchema>;
export type WorkSettings=z.infer<typeof workSettingsSchema>;
export type WorkActivity=z.infer<typeof workActivitySchema>;
export type WorkOrder=WorkInput&{status:string;budgetMode:'expense'|'invoice';spent:number;customerName:string;createdAt:string;updatedAt:string;createdBy:string};
export type WorkLink={orderId:string;kind:'document'|'quotation'|'credit_note'|'task';targetId:string;title:string;documentKind:string;amount:number;outstanding:number;at:string};
export type WorkSnapshot={records:WorkOrder[];settings:WorkSettings;activities:WorkActivity[];links:WorkLink[];drafts:{orderId:string;draftId:string}[];events:{id:string;orderId:string|null;action:string;at:string;actorName:string;detail:Record<string,unknown>}[];finance:FinanceSnapshot;taskTypes:{id:string;name:string}[];canWrite:boolean;canSettings:boolean;canCreate:boolean;canUpdate:boolean;canDelete:boolean;canApprove:boolean;canFiles:boolean;slug:string;brand:string};
export const defaultWorkSettings:WorkSettings={revision:0,nextNumber:1,budgetMode:'expense',statuses:[{id:'open',name:'مفتوح',closed:false,color:'#b99545'},{id:'closed',name:'مغلق',closed:true,color:'#528159'}],actions:[],fields:[],shareEnabled:false,shareMessage:'{{العنوان}} — {{رقم_المستند}}'};
export function newWorkOrder():WorkInput{return{id:crypto.randomUUID(),revision:0,title:'',code:'',start:new Date().toISOString().slice(0,10),end:null,customerId:null,description:'',tags:[],budget:0,staffIds:[],customValues:{},draft:false};}
export function workFieldSources(snapshot:WorkSnapshot):ErpFieldSources{return{customers:{label:'العملاء',options:snapshot.finance.parties.filter(x=>x.kind==='customer').map(x=>({...x,code:'',name:x.name}))},employees:{label:'الموظفون',options:snapshot.finance.staff.map(x=>({id:x.user_id,name:x.name}))},items:{label:'الأصناف',options:snapshot.finance.items},warehouses:{label:'المستودعات',options:snapshot.finance.warehouses},accounts:{label:'الحسابات',options:snapshot.finance.accounts}}}
export function workDocumentLink(kind:string,id:string){return kind==='quotation'?`/dashboard/finance?section=sales&view=quote-create&quote=${id}`:kind==='credit_note'?`/dashboard/finance?section=sales&view=credit-note&creditNote=${id}`:kind==='task'?`/dashboard/system/tasks/task/${id}`:`/dashboard/finance?section=sales&view=invoice&invoice=${id}`;}
export function workBudget(order:Pick<WorkOrder,'budget'|'spent'>){return{remaining:Math.round((order.budget-order.spent)*100)/100,percent:order.budget?Math.round(order.spent/order.budget*100):0};}
export type WorkField=ErpCustomField;
