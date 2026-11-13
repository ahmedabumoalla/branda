import { z } from "zod";
export const organizationKinds={department:"الأقسام",designation:"المسميات الوظيفية",level:"المستويات الوظيفية",type:"أنواع الوظائف"} as const;
export const organizationSingular={department:"القسم",designation:"المسمى الوظيفي",level:"المستوى الوظيفي",type:"نوع الوظيفة"} as const;
export const organizationKindSchema=z.enum(['department','designation','level','type']);
export type OrganizationKind=z.infer<typeof organizationKindSchema>;
const nullableId=z.uuid().nullable().default(null);
export const organizationUnitSchema=z.object({id:nullableId,revision:z.number().int().nonnegative().default(0),kind:organizationKindSchema,name:z.string().trim().min(1).max(150),description:z.string().max(10000).default(''),abbreviation:z.string().max(30).default(''),active:z.boolean().default(true),parentId:nullableId,managerIds:z.array(z.uuid()).max(100).default([])}).strict();
export type OrganizationUnitInput=z.infer<typeof organizationUnitSchema>;
export const organizationAssignmentSchema=z.object({userId:z.uuid(),revision:z.number().int().nonnegative().default(0),departmentId:nullableId,designationId:nullableId,levelId:nullableId,typeId:nullableId,managerId:nullableId}).strict();
export type OrganizationAssignmentInput=z.infer<typeof organizationAssignmentSchema>;
export const organizationActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),data:organizationUnitSchema}),z.object({action:z.literal('assign'),data:organizationAssignmentSchema}),
 z.object({action:z.literal('delete'),data:z.object({id:z.uuid(),revision:z.number().int().positive()}).strict()}),
 z.object({action:z.literal('status'),data:z.object({id:z.uuid(),revision:z.number().int().positive(),active:z.boolean()}).strict()})
]);
export type OrganizationAction=z.infer<typeof organizationActionSchema>;
export type OrganizationUnit={id:string;kind:OrganizationKind;name:string;abbreviation:string;description:string;active:boolean;parent_id:string|null;manager_ids:string[];revision:number;created_at:string;updated_at:string};
export type OrganizationAssignment={user_id:string;department_id:string|null;designation_id:string|null;level_id:string|null;type_id:string|null;manager_id:string|null;revision:number};
export type OrganizationHrStaff={id:string;userId:string|null;name:string;departmentId:string|null;designationId:string|null;levelId:string|null;typeId:string|null;managerId:string|null;active:boolean};
export type OrganizationSnapshot={hrStaff?:OrganizationHrStaff[];units:OrganizationUnit[];assignments:OrganizationAssignment[];staff:{id:string;name:string}[];events:{id:number;record_id:string;action:string;detail:Record<string,unknown>;created_at:string}[];canWrite:boolean};

export function organizationPeople(data:OrganizationSnapshot){
 const hr=data.hrStaff??[],linked=new Set(hr.map(e=>e.userId).filter(Boolean));
 const staff=[...data.staff.filter(s=>!linked.has(s.id)),...hr.map(e=>({id:e.userId??e.id,name:e.name}))];
 const assignments=[...data.assignments.filter(a=>!linked.has(a.user_id)),...hr.map(e=>{const manager=hr.find(m=>m.id===e.managerId);return {user_id:e.userId??e.id,department_id:e.departmentId,designation_id:e.designationId,level_id:e.levelId,type_id:e.typeId,manager_id:manager?(manager.userId??manager.id):e.userId?data.assignments.find(a=>a.user_id===e.userId)?.manager_id??null:null,revision:0};})];
 return {staff,assignments,profiles:Object.fromEntries(hr.map(e=>[e.userId??e.id,e.id]))};
}
