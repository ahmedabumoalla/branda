import {z} from 'zod';
import {erpCustomFieldsSchema,type ErpFieldSources} from './custom-fields';
import {workflowSelectorSchema,defaultWorkflowPermissions,type WorkflowSelector} from './workflows';
import type {ContractingSnapshot} from './contracting';
const id=z.uuid(),revision=z.number().int().nonnegative();
export const contractingFormPermissions=z.object({create:workflowSelectorSchema,read:workflowSelectorSchema,update:workflowSelectorSchema,delete:workflowSelectorSchema,fieldRules:z.array(z.object({id,selector:workflowSelectorSchema,create:z.array(z.string()).max(50),read:z.array(z.string()).max(50),update:z.array(z.string()).max(50)})).max(50)}).strict();
export const contractingFormSchema=z.object({id,revision,kind:z.enum(['primary','related']),name:z.string().trim().min(1).max(160),key:z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),active:z.boolean(),description:z.string().max(5000),nameField:z.string().max(60),fields:erpCustomFieldsSchema,permissions:contractingFormPermissions}).strict();
export type ContractingFormInput=z.infer<typeof contractingFormSchema>;
export function contractingFormInput(model:ContractingForm):ContractingFormInput{return contractingFormSchema.parse(Object.fromEntries(Object.keys(contractingFormSchema.shape).map(key=>[key,model[key as keyof ContractingForm]])));}
export type ContractingForm=ContractingFormInput&{canCreate:boolean;canRead:boolean;canUpdate:boolean;canDelete:boolean;allowedFields:{create:string[];read:string[];update:string[]}};
export type ContractingFormEntry={id:string;modelId:string;projectId:string;revision:number;draft:boolean;values:Record<string,unknown>;createdAt:string;canUpdate:boolean;canDelete:boolean;canFiles:boolean};
export type ContractingFormsSnapshot={models:ContractingForm[];entries:ContractingFormEntry[];canConfigure:boolean;lookups:Record<WorkflowSelector['mode'],{id:string;name:string}[]>;events:{id:string;projectId:string|null;action:string;at:string}[];branchScope?:unknown};
export const contractingFormsCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('model'),payload:contractingFormSchema}),
 z.object({action:z.literal('entry'),payload:z.object({id,revision,projectId:id,modelId:id,draft:z.boolean(),values:z.record(z.string(),z.unknown()).refine(v=>JSON.stringify(v).length<=262144)})}),
 z.object({action:z.literal('delete'),payload:z.object({id,revision,entity:z.enum(['model','entry'])})})
]);
export type ContractingFormsCommand=z.infer<typeof contractingFormsCommand>;
export function newContractingForm(kind:'primary'|'related'):ContractingFormInput {const p=defaultWorkflowPermissions();return{id:crypto.randomUUID(),revision:0,kind,name:kind==='primary'?'المزيد من معلومات المشروع':'',key:kind==='primary'?'project_information':'',active:true,description:'',nameField:'',fields:[],permissions:{create:p.create,read:p.read,update:p.update,delete:p.delete,fieldRules:[]}};}
export function contractingFormSources(snapshot:ContractingSnapshot):ErpFieldSources{return{customers:{label:'العملاء',options:snapshot.finance.parties.filter(x=>x.kind==='customer')},employees:{label:'الموظفون',options:snapshot.finance.staff.map(x=>({id:x.user_id,name:x.name}))},items:{label:'الأصناف',options:snapshot.finance.items},accounts:{label:'الحسابات',options:snapshot.finance.accounts},warehouses:{label:'المستودعات',options:snapshot.finance.warehouses}};}
