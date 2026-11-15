import { currentContext } from "./context";
const unavailable = () => ({ ok: false as const, message: "استخدم تسجيل الدخول وإدارة المستخدمين المحلية" });
export class SalesCashierCreationError extends Error { constructor(public code: string) { super(code); } }
export async function signInFinance(..._args: any[]) { return unavailable(); }
export async function signInSalesCashier(..._args: any[]) { return unavailable(); }
export async function requestSalesCashierOtp(..._args: any[]) { return { ok: false as const, message: "رموز الجوال تحتاج اتصالًا استخدم كلمة المرور المحلية" }; }
export async function verifySalesCashierOtp(..._args: any[]) { return unavailable(); }
export async function resetSalesCashierPassword(..._args: any[]) { return unavailable(); }
async function provision(input: any, role?: string) {
  const context = currentContext();
  if (context.user.role !== "owner" || !context.createUser) throw new Error("إدارة المستخدمين متاحة للمالك فقط");
  const user = await context.createUser({ ...input, username: input.username || input.email || input.phone, role: role || input.role });
  return { ok: true as const, data: user, id: user.id, userId: user.id };
}
export async function provisionFinanceStaff(input: any) { return provision(input); }
export async function provisionSalesCashier(input: any) { return provision(input, "cashier"); }
