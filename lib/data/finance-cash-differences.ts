import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import type { CashDifferenceRow, CashDifferencesPage, CashDifferenceSettlementResult } from "@/lib/finance/cash-differences";

const pageSchema = z.number().int().min(0).max(10_000_000);
const settlementSchema = z.object({
  varianceId: z.uuid(),
  resolution: z.enum(["charge_employee", "waive"]),
  employeeId: z.uuid().nullable().optional(),
  note: z.string().trim().min(1).max(1000),
  requestId: z.uuid(),
}).strict();

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("راجع بيانات فرق الوردية وأكمل الحقول المطلوبة");
  return parsed.data;
}

function databaseError(error: { code?: string; message?: string }): never {
  if (error.code === "42501") throw new Error("تسوية فروقات الوردية متاحة لمالك العلامة فقط");
  if (error.message && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 300) throw new Error(error.message);
  throw new Error("تعذر تأكيد العملية حدث السجل ثم أعد المحاولة بنفس الطلب");
}

async function managementContext(slug?: string) {
  const context = await getBrandFinanceContext(slug);
  if (context.cafe.role !== "owner" && context.cafe.role !== "manager") throw new Error("سجل فروقات الورديات متاح لإدارة العلامة فقط");
  return context;
}

type DatabasePage = { rows: CashDifferenceRow[]; total: number; employees: { id: string; name: string }[]; canSettle: boolean };

export async function getFinanceCashDifferences(offset: unknown = 0, slug?: string): Promise<CashDifferencesPage> {
  const page = validate(pageSchema, offset);
  const { client, cafe } = await managementContext(slug);
  const { data, error } = await client.rpc("brand_finance_cash_differences", { p_cafe_id: cafe.id, p_offset: page, p_limit: 50 });
  if (error) {
    if (error.code === "42501") throw new Error("لا تملك صلاحية عرض فروقات الورديات لهذه العلامة");
    throw new Error("تعذر تحميل فروقات الورديات حاول مجددا");
  }
  const result = data as DatabasePage | null;
  if (!result || !Array.isArray(result.rows) || !Array.isArray(result.employees) || !Number.isSafeInteger(Number(result.total)) || Number(result.total) < 0) throw new Error("تعذر تحميل فروقات الورديات حاول مجددا");
  return {
    rows: result.rows,
    total: Number(result.total),
    hasMore: page + result.rows.length < Number(result.total),
    employees: result.employees.map((employee) => ({ user_id: employee.id, name: employee.name })),
    // The RPC checks the actual brand owner; a maintenance owner-shaped role is insufficient
    canSettle: cafe.role === "owner" && result.canSettle === true,
  };
}

export async function settleFinanceCashDifference(input: unknown, slug?: string): Promise<CashDifferenceSettlementResult> {
  const value = validate(settlementSchema, input);
  if (value.resolution === "charge_employee" && !value.employeeId) throw new Error("اختر الموظف الذي يتحمل فرق الوردية");
  const { client, cafe } = await managementContext(slug);
  if (cafe.role !== "owner") throw new Error("تسوية فروقات الوردية متاحة لمالك العلامة فقط");
  // Keep the caller's authenticated client; the RPC compares auth.uid() to the actual owner
  const { data, error } = await client.rpc("brand_finance_settle_cash_difference", {
    p_cafe_id: cafe.id,
    p_variance_id: value.varianceId,
    p_resolution: value.resolution,
    p_employee_id: value.resolution === "charge_employee" ? value.employeeId : null,
    p_note: value.note,
    p_request_id: value.requestId,
  });
  if (error) databaseError(error);
  if (!data) throw new Error("تعذر تأكيد تسوية الفرق أعد المحاولة بنفس الطلب");
  return data as CashDifferenceSettlementResult;
}
