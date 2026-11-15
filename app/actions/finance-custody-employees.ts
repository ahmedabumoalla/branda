"use server";

import { revalidatePath } from "next/cache";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { readHr, writeHr } from "@/lib/data/erp-hr";
import { createClient } from "@/lib/supabase/server";

// A financial custody is recorded against an employee file. Cashiers created from the loyalty page or as
// finance cashiers are not employee files, so they never appeared in the custody employee list.
// These actions list the cashiers that have no employee file yet and create one for each through the
// original employee save, so the custody keeps its single employee reference. No schema change.

type Candidate = { name: string; source: "finance" | "loyalty" };
const failure = (error: unknown, fallback: string) => ({ ok: false as const, message: error instanceof Error && /[؀-ۿ]/.test(error.message) && error.message.length < 300 ? error.message : fallback });
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

async function missingCashiers(slug: string) {
  const context = await getBrandFinanceContext(slug);
  if (context.cafe.role !== "owner") throw new Error("إضافة الكاشيرات إلى سجل الموظفين متاحة لمالك العلامة");
  const employeeNames = new Set<string>();
  let staff: { name: string; role: string }[] = [];
  for (let page = 1; page <= 30; page++) {
    const { snapshot } = await readHr({ page }, context.cafe.slug);
    if (page === 1) staff = snapshot.staff;
    for (const employee of snapshot.employees) employeeNames.add(clean(`${employee.firstName} ${employee.middleName ?? ""} ${employee.lastName ?? ""}`));
    if (!snapshot.employees.length || employeeNames.size >= snapshot.total) break;
  }
  const supabase = await createClient();
  const loyalty = await supabase.from("cafe_cashiers").select("name,active").eq("cafe_id", context.cafe.id);
  if (loyalty.error) throw new Error("تعذر قراءة كاشيرات الولاء أعد المحاولة");
  const candidates: Candidate[] = [
    ...staff.filter(row => row.role !== "owner").map(row => ({ name: clean(row.name), source: "finance" as const })),
    ...(loyalty.data ?? []).filter(row => row.active !== false).map(row => ({ name: clean(row.name), source: "loyalty" as const })),
  ];
  const seen = new Set<string>();
  const missing = candidates.filter(candidate => candidate.name && !employeeNames.has(candidate.name) && !seen.has(candidate.name) && seen.add(candidate.name));
  return { context, missing, employees: employeeNames.size };
}

export async function listCashiersWithoutEmployeeFile(slug: string) {
  try {
    const { missing, employees } = await missingCashiers(slug);
    return { ok: true as const, missing, employees };
  } catch (error) { return failure(error, "تعذر قراءة الكاشيرات والموظفين أعد المحاولة"); }
}

export async function addCashiersAsEmployees(slug: string) {
  try {
    const { context, missing } = await missingCashiers(slug);
    const joinDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    let added = 0;
    for (const cashier of missing.slice(0, 100)) {
      await writeHr({ action: "save_employee", data: { firstName: cashier.name.slice(0, 100), joinDate, note: cashier.source === "loyalty" ? "كاشير مضاف من صفحة الولاء" : "كاشير مضاف من المالية" } }, crypto.randomUUID(), context.cafe.slug);
      added++;
    }
    revalidatePath("/dashboard/system/finance", "layout");
    return { ok: true as const, added };
  } catch (error) { return failure(error, "تعذر إضافة الكاشيرات إلى سجل الموظفين أعد المحاولة"); }
}
