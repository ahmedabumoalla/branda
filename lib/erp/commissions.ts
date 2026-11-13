import {z} from 'zod';
import {moneyRound} from '@/lib/finance/company-invoice';
const number=z.number().finite().min(0).max(1_000_000_000);
const id=z.uuid();
export const commissionItemSchema=z.object({id,kind:z.enum(['all','product','category']),targets:z.array(z.string().min(1).max(160)).max(200),amount:number,amountType:z.enum(['percentage','fixed'])}).strict().refine(v=>v.kind==='all'||v.targets.length>0,'اختر البنود المشمولة').refine(v=>v.amountType!=='percentage'||v.amount<=100,'النسبة لا تتجاوز مئة بالمئة');
export const commissionRuleSchema=z.object({id:id.nullable().default(null),revision:z.number().int().nonnegative().default(0),name:z.string().trim().min(1).max(150),active:z.boolean().default(true),description:z.string().max(10000).default(''),targetType:z.enum(['revenue','volume']),targetAmount:number.positive(),type:z.enum(['flat','tiers']),tierType:z.enum(['fixed','percentage']),interpolation:z.enum(['linear','steps']),items:z.array(commissionItemSchema).min(1).max(100),tiers:z.array(z.object({target:number,value:number}).strict()).max(50),staffIds:z.array(id).max(500),roles:z.array(z.enum(['manager','cashier','accountant','warehouse','auditor'])).max(5),departmentIds:z.array(id).max(100),branchIds:z.array(id).max(100)}).strict().superRefine((v,ctx)=>{
 if(!v.staffIds.length&&!v.roles.length&&!v.departmentIds.length&&!v.branchIds.length)ctx.addIssue({code:'custom',path:['staffIds'],message:'اختر موظفًا أو مجموعة واحدة على الأقل'});
 if(v.type==='tiers'&&!v.tiers.length)ctx.addIssue({code:'custom',path:['tiers'],message:'أضف مستوى واحدًا على الأقل'});
 if(new Set(v.items.map(i=>i.id)).size!==v.items.length)ctx.addIssue({code:'custom',path:['items'],message:'معرفات البنود مكررة'});
 if(new Set(v.tiers.map(t=>t.target)).size!==v.tiers.length)ctx.addIssue({code:'custom',path:['tiers'],message:'لا تكرر نسبة الإنجاز'});
 if(v.tierType==='percentage'&&v.tiers.some(t=>t.value>100))ctx.addIssue({code:'custom',path:['tiers'],message:'نسبة عمولة المستوى لا تتجاوز مئة بالمئة'});
});
export type CommissionRuleInput=z.infer<typeof commissionRuleSchema>;
export type CommissionSaleLine={id:string;documentId:string;number:string;productId:string|null;category:string;name:string;quantity:number;net:number;employeeId:string;issuedAt:string};
/** Rules are evaluated on server-selected, paid, unreturned invoice lines only. */
export function calculateCommission(rule:CommissionRuleInput,lines:CommissionSaleLine[]){
 let achievement=0,flat=0;const included:({line:CommissionSaleLine;contribution:number;commission:number;itemId:string})[]=[];
 for(const line of lines){
  // A line contributes once even when product/category filters overlap. Most specific rule wins.
  const item=rule.items.filter(i=>i.kind==='all'||i.kind==='product'&&!!line.productId&&i.targets.includes(line.productId)||i.kind==='category'&&i.targets.includes(line.category)).sort((a,b)=>({product:0,category:1,all:2}[a.kind])-({product:0,category:1,all:2}[b.kind]))[0];
  if(!item)continue;
  const contribution=(rule.targetType==='volume'?line.quantity:line.net)*(rule.type==='tiers'?item.amount/100:1);
  const commission=rule.type==='flat'?moneyRound(item.amountType==='percentage'?line.net*item.amount/100:item.amount):0;
  achievement+=contribution;flat+=commission;included.push({line,contribution,commission,itemId:item.id});
 }
 const percentage=achievement/rule.targetAmount*100;let tierValue=0;
 if(rule.type==='tiers'){
  const tiers=[...rule.tiers].sort((a,b)=>a.target-b.target),lower=[...tiers].reverse().find(t=>t.target<=percentage),upper=tiers.find(t=>t.target>percentage);
  if(rule.interpolation==='steps'||!upper)tierValue=lower?.value??0;
  else{const before=lower??{target:0,value:0};tierValue=before.value+(upper.value-before.value)*(percentage-before.target)/(upper.target-before.target);}
 }
 return {achievement:Math.round(achievement*1000)/1000,percentage,total:rule.type==='flat'?moneyRound(flat):moneyRound(rule.tierType==='fixed'?tierValue:achievement*tierValue/100),included};
}
export const commissionPeriodSchema=z.object({from:z.iso.date(),to:z.iso.date(),ruleIds:z.array(id).max(100).default([]),staffIds:z.array(id).max(500).default([]),departmentId:id.nullable().default(null),branchId:id.nullable().default(null),designationId:id.nullable().default(null)}).strict().refine(v=>v.to>=v.from&&Date.parse(v.to)-Date.parse(v.from)<=366*86400000,'اختر فترة لا تتجاوز سنة');
export type CommissionPeriodInput=z.infer<typeof commissionPeriodSchema>;
export const commissionActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save_rule'),data:commissionRuleSchema}),
 z.object({action:z.literal('delete_rule'),data:z.object({id,revision:z.number().int().positive()}).strict()}),
 z.object({action:z.literal('create_period'),data:commissionPeriodSchema}),
 z.object({action:z.enum(['refresh','delete_period','approve','reject','reopen']),data:z.object({id,revision:z.number().int().positive()}).strict()}),
 z.object({action:z.literal('payout'),data:z.object({id,revision:z.number().int().positive(),accountId:id}).strict()}),
 z.object({action:z.literal('assign_sale'),data:z.object({id,revision:z.number().int().nonnegative(),employeeId:id,branchId:id.nullable()}).strict()})
]);
export type CommissionAction=z.infer<typeof commissionActionSchema>;
export const commissionStatuses={open:'مفتوح',approved:'تمت الموافقة',rejected:'مرفوض',paid:'تم الصرف'} as const;
export const commissionListQuerySchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),query:z.string().max(120).default(''),status:z.enum(['','open','approved','rejected','paid']).default('')}).strict();
export type CommissionListQuery=z.infer<typeof commissionListQuerySchema>;
export type CommissionRule=CommissionRuleInput&{createdAt:string};
export type CommissionPeriod={id:string;number:number;from:string;to:string;status:keyof typeof commissionStatuses;revision:number;total:number;createdAt:string;payoutId:string|null;rows:{id:string;employeeId:string;employeeName:string;ruleId:string;ruleName:string;target:number;achievement:number;total:number;lines:CommissionSaleLine[]}[]};
export type CommissionSnapshot={totalPeriods:number;rules:CommissionRule[];periods:CommissionPeriod[];staff:{id:string;name:string;role:string}[];products:{id:string;name:string;category:string}[];departments:{id:string;name:string}[];designations:{id:string;name:string}[];branches:{id:string;name:string}[];accounts:{id:string;name:string}[];events:{id:number;action:string;created_at:string}[];canWrite:boolean;canApprove:boolean;canConfigure:boolean};
export type CommissionSaleSnapshot={total:number;rows:{id:string;number:number;created_at:string;total:number;outstanding:number;employee_id:string;branch_id:string|null;revision:number}[]};
