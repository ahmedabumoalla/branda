import {z} from "zod";
import {invoiceInstallments,invoiceInstallmentBalances,type InvoiceSchedule,type InvoiceDetail} from "@/lib/finance/invoice-management";
export {invoiceInstallments,invoiceInstallmentBalances};
export const installmentFrequencies={weekly:"أسبوعيًا",fortnightly:"كل أسبوعين",monthly:"شهريًا",quarterly:"ربع سنوي",half_yearly:"نصف سنوي",yearly:"سنويًا"} as const;
export const installmentStatuses={unpaid:"غير مدفوع",partial:"مدفوع جزئيًا",paid:"مدفوع",overdue:"متأخر",cancelled:"ملغى بالمرتجع"} as const;
export type InstallmentStatus=keyof typeof installmentStatuses;
const money=z.number().finite().min(.01).max(1e9).multipleOf(.01);
export const installmentScheduleSchema=z.object({amount:money,start:z.iso.date(),frequency:z.enum(['weekly','fortnightly','monthly','quarterly','half_yearly','yearly']),note:z.string().max(500)}).strict();
export const installmentFiltersSchema=z.object({mode:z.enum(['agreements','installments','invoices']).default('agreements'),query:z.string().max(100).default(''),status:z.enum(['all','unpaid','partial','paid','overdue','cancelled']).default('all'),from:z.union([z.iso.date(),z.literal('')]).default(''),to:z.union([z.iso.date(),z.literal('')]).default(''),sort:z.enum(['newest','oldest','due','amount']).default('newest'),offset:z.number().int().min(0).max(100000).default(0),limit:z.number().int().min(1).max(100).default(30)}).strict();
export type InstallmentFilters=z.infer<typeof installmentFiltersSchema>;
export type {DocumentTemplate as InstallmentTemplate} from "@/lib/erp/templates";
const expected={documentId:z.uuid(),expectedSchedule:installmentScheduleSchema.nullable()};
export const installmentCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('schedule'),payload:z.object({...expected,schedule:installmentScheduleSchema.nullable()}).strict()}),
 z.object({action:z.literal('collect'),payload:z.object({...expected,number:z.number().int().min(1).max(600),expectedOutstanding:z.number().finite().nonnegative(),amount:money,accountId:z.uuid(),date:z.iso.date(),collectorId:z.uuid(),status:z.enum(['completed','pending']),reference:z.string().max(160),details:z.string().max(1000),receiptNote:z.string().max(500),attachments:z.array(z.uuid()).max(20)}).strict()}),
]);
export type InstallmentCommand=z.infer<typeof installmentCommandSchema>;
export type InstallmentRow={number:number;date:string;amount:number;paid:number;cancelled:number;remaining:number;status:InstallmentStatus};
export type InstallmentAgreement={id:string;number:number;invoiceNumber:string;customerId:string;customerName:string;total:number;outstanding:number;refundedTotal:number;refunded:boolean;paid:number;createdAt:string;schedule:InvoiceSchedule|null;nextDue:string|null;status:InstallmentStatus;row:InstallmentRow|null};
export type InstallmentSnapshot={items:InstallmentAgreement[];total:number;canWrite:boolean;templates:import("@/lib/erp/templates").DocumentTemplate[];accounts:{id:string;name:string;kind:string}[];collectors:{id:string;name:string}[];actorId:string};
export type InstallmentDetail={agreement:InstallmentAgreement;detail:InvoiceDetail;rows:InstallmentRow[]};
export function installmentRows(detail:InvoiceDetail,today:string):InstallmentRow[]{return detail.metadata.schedule?invoiceInstallmentBalances(detail.document,detail.metadata.schedule).map(row=>({...row,status:row.remaining>0&&row.date<today?'overdue':row.status as InstallmentStatus})):[]}
export function installmentTemplateText(text:string,values:Record<string,string>){return text.replace(/\{\{([^{}]+)\}\}/g,(token,key:string)=>values[key.trim()]??token)}
export const installmentTemplateVariables=['العلامة','العميل','رقم_الفاتورة','المبلغ','المدفوع','المتبقي','تاريخ_البدء','تاريخ_الاستحقاق','رقم_القسط','مبلغ_القسط'] as const;
