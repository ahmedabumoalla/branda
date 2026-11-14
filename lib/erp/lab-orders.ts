import { z } from "zod";
import { normalizePosCustomerPhone } from "@/lib/finance/pos-customer";
import { normalizeTemplatePhone } from "@/lib/erp/template-delivery-policy";

export const labStatuses = ["requested", "preparing", "on_hold", "prepared", "out_for_delivery", "delivered", "recalled", "cancelled"] as const;
export type LabStatus = typeof labStatuses[number];
export const labRecordCategories = ["supplier", "cleaning", "temperature", "packaging", "lab_test", "staff_health", "pest_control"] as const;
export const labSafetyProfileSchema = z.object({
  productId: z.uuid(), revision: z.number().int().min(0), enabled: z.boolean(),
  recipeVersion: z.string().trim().min(1).max(100), processReference: z.string().trim().min(1).max(500),
  minimumTemperature: z.number().finite().min(-100).max(400), maximumTemperature: z.number().finite().min(-100).max(400),
  allergens: z.string().trim().min(1).max(1000), storageInstructions: z.string().trim().min(1).max(1000),
  maxShelfLifeDays: z.number().int().min(1).max(3660), requiredRecords: z.array(z.enum(labRecordCategories)).min(1).max(7),
}).refine(p => p.minimumTemperature <= p.maximumTemperature, "راجع حدود الحرارة المعتمدة");
export type LabSafetyProfileInput = z.input<typeof labSafetyProfileSchema>;
export type LabSafetyProfile = LabSafetyProfileInput & { productName: string; updatedAt: string };
export const labQualitySchema = z.object({
  lotCode: z.string().trim().min(1).max(100),
  producedOn: z.iso.date(), expiresOn: z.iso.date(),
  allergens: z.string().trim().min(1).max(1000),
  storageInstructions: z.string().trim().min(1).max(1000),
  ingredientLots: z.string().trim().min(1).max(2000),
  temperatureReading: z.string().trim().min(1).max(500),
  processReference: z.string().trim().min(1).max(500),
  temperatureCelsius: z.number().finite().min(-100).max(400),
  minimumTemperature: z.number().finite().min(-100).max(400),
  maximumTemperature: z.number().finite().min(-100).max(400),
  recordReferences: z.record(z.string().max(50), z.string().trim().max(1000)).default({}),
  checks: z.object({ ingredients: z.literal(true), cleaning: z.literal(true), temperature: z.literal(true), packaging: z.literal(true) }),
}).refine(q => q.expiresOn >= q.producedOn, "انتهاء الصلاحية يجب أن يكون بعد الإنتاج")
  .refine(q => q.minimumTemperature <= q.maximumTemperature && q.temperatureCelsius >= q.minimumTemperature && q.temperatureCelsius <= q.maximumTemperature, "قراءة الحرارة خارج الحدود المعتمدة أوقف التشغيلة للمراجعة");
export type LabQuality = z.infer<typeof labQualitySchema> & { approvedProfiles?: LabSafetyProfile[] };
export const createLabOrderSchema = z.object({
  requestId: z.uuid(), branchId: z.uuid(), customerId: z.uuid(),
  requiredAt: z.iso.datetime({ offset: true }), notes: z.string().trim().max(2000).default(""),
  lines: z.array(z.object({ productId: z.uuid(), quantity: z.number().finite().positive().max(100000).multipleOf(0.001) })).min(1).max(50),
});
export const actLabOrderSchema = z.object({ requestId: z.uuid(), id: z.uuid(), revision: z.number().int().positive(), status: z.enum(labStatuses), note: z.string().trim().max(2000).default(""), quality: labQualitySchema.optional() });
export const linkLabInvoiceSchema = z.object({ requestId: z.uuid(), id: z.uuid(), revision: z.number().int().positive(), invoiceId: z.uuid() });
export const labOperatorSchema = z.object({ userId: z.uuid(), enabled: z.boolean() });
export function normalizeLabCustomerPhone(value: string): string | null {
  const saudi = normalizePosCustomerPhone(value);
  if (saudi) return saudi;
  const western = value.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)));
  if (western.length > 30 || !/^(\+|00)[\d\s()-]+$/.test(western)) return null;
  return normalizeTemplatePhone(western);
}
export const labCustomerSchema = z.object({ requestId: z.uuid(), branchId: z.uuid().optional(), name: z.string().trim().min(2).max(150), phone: z.string().trim().max(30).refine(value => normalizeLabCustomerPhone(value) !== null, "أدخل رقم جوال سعودي أو رقمًا دوليًا مع مفتاح الدولة") }).strict();
export type CreateLabOrderInput = z.input<typeof createLabOrderSchema>;
export type ActLabOrderInput = z.input<typeof actLabOrderSchema>;
export type LinkLabInvoiceInput = z.input<typeof linkLabInvoiceSchema>;
export type LabLine = { productId: string; name: string; imageUrl: string | null; quantity: number };
export type LabOrder = {
  id: string; number: number; revision: number; status: LabStatus; branchId: string; branchName: string;
  customerId: string; customerName: string; customerPhone: string; requiredAt: string; notes: string;
  createdAt: string; lines: LabLine[]; invoiceId: string | null; invoiceNumber: string | null;
  total: number | null; paid: number; outstanding: number | null; refunded: number;
  payments: { id: string; number: string; amount: number; method: string; at: string; status: string }[];
  events: { id: string; action: string; note: string; at: string; actorName: string }[];
  quality: LabQuality | null;
};
export type LabSnapshot = {
  slug: string; cafeName: string; role: string; generatedAt: string;
  capabilities: { create: boolean; prepare: boolean; linkInvoice: boolean; manageOperators: boolean; manageSafetyProfiles: boolean };
  orders: LabOrder[]; products: { id: string; name: string; imageUrl: string | null; price: number }[];
  customers: { id: string; name: string; phone: string }[]; branches: { id: string; name: string }[];
  invoices: { id: string; number: string; customerId: string; total: number }[];
  operators: { userId: string; name: string; enabled: boolean }[];
  safetyProfiles: LabSafetyProfile[];
};
