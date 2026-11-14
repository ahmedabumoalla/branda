"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { manufacturingError } from "@/lib/data/erp-manufacturing";
import { readLabOrders } from "@/lib/data/erp-lab-orders";
import { actionResult } from "@/lib/platform/action-result";
import { createLabOrderSchema, actLabOrderSchema, linkLabInvoiceSchema, labOperatorSchema, labSafetyProfileSchema, labCustomerSchema, type LabSafetyProfileInput, type CreateLabOrderInput, type ActLabOrderInput, type LinkLabInvoiceInput } from "@/lib/erp/lab-orders";

async function command(action: string, payload: unknown, slug?: string) {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("erp_lab_execute", { p_cafe: cafe.id, p_action: action, p_payload: payload });
  manufacturingError(error);
  revalidatePath("/dashboard/system/lab");
  revalidatePath(`/finance/${cafe.slug}/lab`);
  return data as { id: string; revision: number; duplicate?: boolean; existing?: boolean };
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error("راجع بيانات طلب المعمل والحقول المطلوبة");
  return result.data;
}
export async function getLabOrders(slug?: string) { return actionResult(() => readLabOrders(slug), "تعذر تحميل المعمل"); }
export async function createLabOrder(input: CreateLabOrderInput, slug?: string) { return actionResult(() => command("create", parse(createLabOrderSchema,input), slug), "راجع بيانات طلب المعمل"); }
export async function actLabOrder(input: ActLabOrderInput, slug?: string) { return actionResult(() => command("status", parse(actLabOrderSchema,input), slug), "راجع حالة الطلب وبيانات التجهيز"); }
export async function linkLabInvoice(input: LinkLabInvoiceInput, slug?: string) { return actionResult(() => command("invoice", parse(linkLabInvoiceSchema,input), slug), "تعذر ربط الفاتورة بالطلب"); }
export async function saveLabOperator(input: { userId: string; enabled: boolean }, slug?: string) { return actionResult(() => command("operator", parse(labOperatorSchema,input), slug), "تعذر تعديل صلاحية المعمل"); }
export async function saveLabSafetyProfile(input: LabSafetyProfileInput, slug?: string) { return actionResult(() => command("profile", parse(labSafetyProfileSchema,input), slug), "تعذر اعتماد ملف سلامة المنتج"); }
export async function createLabCustomer(input: { requestId: string; branchId?: string; name: string; phone: string }, slug?: string) { return actionResult(() => command("customer", parse(labCustomerSchema,input), slug), "تعذر إضافة عميل الطلب"); }
