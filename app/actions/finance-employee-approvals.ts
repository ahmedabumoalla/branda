"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import type { EmployeeApproval } from "@/lib/finance/employee-approvals";
import { employeePermissionKeys } from "@/lib/finance/employee-permissions";

export async function loadEmployeeApprovals(slug: string) {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_approvals", { p_cafe_id: cafe.id });
  if (error) throw new Error("تعذر تحميل طلبات الاعتماد حاول مجددًا");
  return { rows: (data ?? []) as EmployeeApproval[], name: cafe.name };
}

export async function reviewEmployeeApproval(slug: string, input: unknown) {
  try {
    const parsed = z.object({ requestId: z.uuid(), permission: z.enum(employeePermissionKeys), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000) }).parse(input);
    const { client, cafe } = await getBrandFinanceContext(slug);
    const { error } = await client.rpc("brand_finance_approval_review", { p_cafe_id: cafe.id, p_request_id: parsed.requestId, p_permission: parsed.permission, p_decision: parsed.decision, p_note: parsed.note });
    if (error) throw error;
    return { ok: true as const, rows: (await loadEmployeeApprovals(slug)).rows };
  } catch { return { ok: false as const, message: "تعذر اعتماد الطلب تحقق من صلاحيتك وحالة الطلب ثم أعد المحاولة" }; }
}
