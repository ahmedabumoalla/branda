import {z} from 'zod';
import {erpCustomFieldsSchema} from './custom-fields';
import {workflowSelectorSchema,defaultWorkflowPermissions,type WorkflowSelector} from './workflows';
import type {CustomerSnapshot} from './customers';
export type CustomerFormsContext=Pick<CustomerSnapshot,'slug'|'customers'|'users'>&{forms:CustomerFormsSnapshot;onSaved?:()=>void};

const id=z.uuid(),revision=z.number().int().nonnegative();
export const customerFormPermissions=z.object({create:workflowSelectorSchema,read:workflowSelectorSchema,update:workflowSelectorSchema,delete:workflowSelectorSchema,fieldRules:z.array(z.object({id,selector:workflowSelectorSchema,create:z.array(z.string()).max(50),read:z.array(z.string()).max(50),update:z.array(z.string()).max(50)})).max(50)}).strict();
export const customerFormSchema=z.object({id,revision,targetKind:z.enum(['customers']),kind:z.enum(['primary','related']),name:z.string().trim().min(1).max(160),key:z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),active:z.boolean(),description:z.string().max(5000),nameField:z.string().max(60),fields:erpCustomFieldsSchema,permissions:customerFormPermissions}).strict();
export type CustomerFormInput=z.infer<typeof customerFormSchema>;
export type CustomerForm=CustomerFormInput&{canCreate:boolean;canRead:boolean;canUpdate:boolean;canDelete:boolean;allowedFields:{create:string[];read:string[];update:string[]}};
export function customerFormInput(model:CustomerForm):CustomerFormInput{return customerFormSchema.parse(Object.fromEntries(Object.keys(customerFormSchema.shape).map(key=>[key,model[key as keyof CustomerForm]])));}
export type CustomerFormEntry={id:string;modelId:string;recordId:string;targetKind:'customers';revision:number;draft:boolean;values:Record<string,unknown>;createdAt:string;canUpdate:boolean;canDelete:boolean;canFiles:boolean};
export type CustomerFormsSnapshot={models:CustomerForm[];entries:CustomerFormEntry[];canConfigure:boolean;lookups:Record<WorkflowSelector['mode'],{id:string;name:string}[]>;events:{id:string;recordId:string|null;action:string;at:string}[];branchScope?:unknown};
export const customerFormsCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('model'),payload:customerFormSchema}),
 z.object({action:z.literal('entry'),payload:z.object({id,revision,recordId:id,targetKind:z.enum(['customers']),modelId:id,draft:z.boolean(),values:z.record(z.string(),z.unknown()).refine(v=>JSON.stringify(v).length<=262144)})}),
 z.object({action:z.literal('delete'),payload:z.object({id,revision,entity:z.enum(['model','entry'])})}),
]);
export type CustomerFormsCommand=z.infer<typeof customerFormsCommand>;
export function customerFormSources(snapshot:CustomerFormsContext){return {customers:{label:'العملاء',options:snapshot.customers.map(row=>({id:row.id,name:row.name,code:row.profile.code}))},employees:{label:'الموظفون',options:snapshot.users}};}
export function newCustomerForm(targetKind:'customers',kind:'primary'|'related'):CustomerFormInput {
 const p=defaultWorkflowPermissions();
 return {id:crypto.randomUUID(),revision:0,targetKind,kind,name:kind==='primary'?'المزيد من معلومات العميل':'',key:kind==='primary'?'additional_information':'',active:true,description:'',nameField:'',fields:[],permissions:{create:p.create,read:p.read,update:p.update,delete:p.delete,fieldRules:[]}};
}
