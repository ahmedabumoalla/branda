import {z} from 'zod';
import {erpCustomFieldsSchema} from './custom-fields';
import {workflowSelectorSchema,defaultWorkflowPermissions,type WorkflowSelector} from './workflows';
import {manufacturingFieldSources,type ManufacturingSnapshot} from './manufacturing';

const id=z.uuid(),revision=z.number().int().nonnegative();
export const manufacturingFormPermissions=z.object({create:workflowSelectorSchema,read:workflowSelectorSchema,update:workflowSelectorSchema,delete:workflowSelectorSchema,fieldRules:z.array(z.object({id,selector:workflowSelectorSchema,create:z.array(z.string()).max(50),read:z.array(z.string()).max(50),update:z.array(z.string()).max(50)})).max(50)}).strict();
export const manufacturingFormSchema=z.object({id,revision,targetKind:z.enum(['orders','plans']),kind:z.enum(['primary','related']),name:z.string().trim().min(1).max(160),key:z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),active:z.boolean(),description:z.string().max(5000),nameField:z.string().max(60),fields:erpCustomFieldsSchema,permissions:manufacturingFormPermissions}).strict();
export type ManufacturingFormInput=z.infer<typeof manufacturingFormSchema>;
export type ManufacturingForm=ManufacturingFormInput&{canCreate:boolean;canRead:boolean;canUpdate:boolean;canDelete:boolean;allowedFields:{create:string[];read:string[];update:string[]}};
export function manufacturingFormInput(model:ManufacturingForm):ManufacturingFormInput{return manufacturingFormSchema.parse(Object.fromEntries(Object.keys(manufacturingFormSchema.shape).map(key=>[key,model[key as keyof ManufacturingForm]])));}
export type ManufacturingFormEntry={id:string;modelId:string;recordId:string;targetKind:'orders'|'plans';revision:number;draft:boolean;values:Record<string,unknown>;createdAt:string;canUpdate:boolean;canDelete:boolean;canFiles:boolean};
export type ManufacturingFormsSnapshot={models:ManufacturingForm[];entries:ManufacturingFormEntry[];canConfigure:boolean;lookups:Record<WorkflowSelector['mode'],{id:string;name:string}[]>;events:{id:string;recordId:string|null;action:string;at:string}[];branchScope?:unknown};
export const manufacturingFormsCommand=z.discriminatedUnion('action',[
 z.object({action:z.literal('model'),payload:manufacturingFormSchema}),
 z.object({action:z.literal('entry'),payload:z.object({id,revision,recordId:id,targetKind:z.enum(['orders','plans']),modelId:id,draft:z.boolean(),values:z.record(z.string(),z.unknown()).refine(v=>JSON.stringify(v).length<=262144)})}),
 z.object({action:z.literal('delete'),payload:z.object({id,revision,entity:z.enum(['model','entry'])})}),
]);
export type ManufacturingFormsCommand=z.infer<typeof manufacturingFormsCommand>;
export function manufacturingFormSources(snapshot:ManufacturingSnapshot){const sources=manufacturingFieldSources(snapshot);return Object.fromEntries(Object.entries(sources).filter(([key])=>key!=='assets'));}
export function newManufacturingForm(targetKind:'orders'|'plans',kind:'primary'|'related'):ManufacturingFormInput {
 const p=defaultWorkflowPermissions();
 return {id:crypto.randomUUID(),revision:0,targetKind,kind,name:kind==='primary'?(targetKind==='orders'?'المزيد من معلومات أمر التصنيع':'المزيد من معلومات خطة الإنتاج'):'',key:kind==='primary'?'additional_information':'',active:true,description:'',nameField:'',fields:[],permissions:{create:p.create,read:p.read,update:p.update,delete:p.delete,fieldRules:[]}};
}
