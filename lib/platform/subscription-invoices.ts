import { z } from "zod";

export const INVOICE_MONTHS = [1, 3, 6, 9, 12] as const;
export const INVOICE_SELLER = { name: "شركة العنوان الحصري", cr: "5850157983", vatNumber: "312872746700003", nationalAddress: "AKAA8043", buildingNumber: "8043", additionalNumber: "3076", district: "حي الذلالة", city: "خميس مشيط", postalCode: "62411", country: "المملكة العربية السعودية" };
const text = (max: number) => z.string().trim().max(max);
export const invoiceCustomerSchema = z.object({
  name: text(160).min(2), cr: text(10).regex(/^(?:\d{10})?$/), vatNumber: text(15).regex(/^(?:3\d{13}3)?$/),
  nationalAddress: text(120), buildingNumber: text(4).regex(/^\d{0,4}$/), additionalNumber: text(4).regex(/^\d{0,4}$/),
  district: text(100), city: text(100), postalCode: text(5).regex(/^(?:\d{5})?$/), country: text(100).min(2),
}).strict();
export const subscriptionInvoiceSchema = z.object({
  requestId: z.uuid(), customer: invoiceCustomerSchema,
  taxInclusive: z.boolean(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v),
  lines: z.array(z.object({ planId: text(120).min(1), months: z.union([z.literal(1),z.literal(3),z.literal(6),z.literal(9),z.literal(12)]), amountCents: z.number().int().min(1).max(9_999_999_999) }).strict()).min(1).max(8),
}).strict();
export type InvoiceCustomer = z.infer<typeof invoiceCustomerSchema>;
export type SubscriptionInvoiceDraft = z.infer<typeof subscriptionInvoiceSchema>;
export type SubscriptionInvoiceLine = { planId: string; planName: string; months: number; description: string; amountCents: number; netCents: number; taxCents: number; totalCents: number };
export type SubscriptionInvoice = { id: string; number: string; issuedAt: string; dueDate: string; seller: InvoiceCustomer; customer: InvoiceCustomer; taxInclusive: boolean; taxRate: number; lines: SubscriptionInvoiceLine[]; netCents: number; taxCents: number; totalCents: number; templateVersion: 1 };
export type InvoicePlan = { id: string; name: string };
export type InvoiceRow = { id: string; invoice_number: string; issued_at: string; customer_name: string; total_cents: number };
export type InvoiceList = { rows: InvoiceRow[]; total: number; page: number; search: string };
export function invoiceMoney(cents: number) { return (cents / 100).toFixed(2); }
export function parseInvoiceMoney(value: string): number | null {
  const normalized=value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace('٫','.');
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized))return null;
  const [whole,fraction='']=normalized.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return cents>0&&cents<=9_999_999_999?cents:null;
}
export function invoiceLineAmounts(amountCents: number, taxInclusive: boolean) {
  const netCents=taxInclusive?Math.round(amountCents*100/115):amountCents;
  const taxCents=taxInclusive?amountCents-netCents:Math.round(netCents*15/100);
  return {netCents,taxCents,totalCents:netCents+taxCents};
}
export function invoiceDuration(months: number) { return months===1?'شهر':months===12?'سنة':`${months} أشهر`; }
export function invoiceDescription(planName: string, months: number) { return `اشتراك ${planName} لمدة ${invoiceDuration(months)}`; }
export function invoiceLocalDate(date=new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export function previewSubscriptionInvoice(draft: SubscriptionInvoiceDraft, plans: InvoicePlan[]): SubscriptionInvoice {
  const lines=draft.lines.map(line=>{const plan=plans.find(p=>p.id===line.planId);if(!plan)throw Error('اختر باقة متاحة لكل بند');return {...line,planName:plan.name,description:invoiceDescription(plan.name,line.months),...invoiceLineAmounts(line.amountCents,draft.taxInclusive)};});
  return {id:draft.requestId,number:'معاينة غير صادرة',issuedAt:new Date().toISOString(),dueDate:draft.dueDate,seller:INVOICE_SELLER,customer:draft.customer,taxInclusive:draft.taxInclusive,taxRate:15,lines,netCents:lines.reduce((n,l)=>n+l.netCents,0),taxCents:lines.reduce((n,l)=>n+l.taxCents,0),totalCents:lines.reduce((n,l)=>n+l.totalCents,0),templateVersion:1};
}
