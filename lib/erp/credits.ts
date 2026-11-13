import type {MembershipRenewal} from '@/lib/erp/memberships';
import { z } from "zod";

const base={id:z.uuid(),revision:z.number().int().min(0)};
const quantity=z.number().finite().positive().max(1e12).multipleOf(.0001);
export const creditTypeSchema=z.object({...base,name:z.string().trim().min(1).max(150),unit:z.string().trim().max(30),description:z.string().max(4000),active:z.boolean(),decimals:z.boolean()}).strict();
export const creditPackageSchema=z.object({...base,name:z.string().trim().min(1).max(150),kind:z.enum(["membership","credit"]),price:z.number().finite().nonnegative().max(1e9).multipleOf(.01),period:z.number().int().min(1).max(3650),periodUnit:z.enum(["day","week","month","year"]),description:z.string().max(4000),active:z.boolean(),lines:z.array(z.object({typeId:z.uuid(),quantity}).strict()).max(100)}).strict().superRefine((v,c)=>{if(v.kind==="credit"&&!v.lines.length)c.addIssue({code:"custom",message:"أضف نوع رصيد واحدًا على الأقل"});if(new Set(v.lines.map(l=>l.typeId)).size!==v.lines.length)c.addIssue({code:"custom",message:"نوع الرصيد مكرر داخل الباقة"});});
export const creditChargeSchema=z.object({...base,customerId:z.uuid(),typeId:z.uuid(),quantity,startsOn:z.iso.date(),expiresOn:z.union([z.iso.date(),z.literal("")]),description:z.string().max(4000),suspended:z.boolean()}).strict().superRefine((v,c)=>{if(v.expiresOn&&v.expiresOn<v.startsOn)c.addIssue({code:"custom",message:"تاريخ انتهاء الرصيد يسبق بدايته"});});
export const creditUsageSchema=z.object({...base,customerId:z.uuid(),typeId:z.uuid(),quantity,usedOn:z.iso.date(),description:z.string().max(4000),chargeId:z.uuid().nullable()}).strict();
export type CreditType=z.infer<typeof creditTypeSchema>;
export type CreditPackage=z.infer<typeof creditPackageSchema>;
export type CreditCharge=z.infer<typeof creditChargeSchema>&{number:number;remaining:number;sourceKind:string;sourceId:string|null;createdAt:string};
export type CreditUsage=z.infer<typeof creditUsageSchema>&{number:number;voided:boolean;createdAt:string};
export type CreditSnapshot={purchases?:MembershipRenewal[];types:CreditType[];packages:CreditPackage[];charges:CreditCharge[];usages:CreditUsage[];allocations:{usageId:string;chargeId:string;quantity:number}[];customers:{id:string;name:string;phone:string;active:boolean}[];events:{id:string;recordId:string;action:string;at:string;actorName:string}[];canCreate:boolean;canUpdate:boolean;canDelete:boolean;canSettings:boolean;slug:string;brand:string;today:string};
export const creditSections=[{key:"charges",title:"إدارة شحن الأرصدة",single:"شحنة رصيد"},{key:"usages",title:"إدارة استهلاك الأرصدة",single:"استهلاك رصيد"},{key:"packages",title:"إدارة الباقات",single:"باقة"},{key:"types",title:"أنواع الرصيد",single:"نوع رصيد"}] as const;
export type CreditSection=typeof creditSections[number]["key"];
export const creditPeriods={day:"يوم",week:"أسبوع",month:"شهر",year:"سنة"};
export function creditAvailable(charges:CreditCharge[],customerId:string,typeId:string,date:string,chargeId?:string|null){return charges.filter(c=>c.customerId===customerId&&c.typeId===typeId&&!c.suspended&&c.startsOn<=date&&(!c.expiresOn||c.expiresOn>=date)&&(!chargeId||c.id===chargeId)).reduce((n,c)=>n+c.remaining,0);}
export function creditChargeStatus(c:CreditCharge,today:string){return c.suspended?"موقوف":c.startsOn>today?"لم يبدأ":c.expiresOn&&c.expiresOn<today?"منتهي":c.remaining<=0?"مستهلك":"متاح";}
