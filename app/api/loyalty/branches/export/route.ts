import { getOwnerLoyaltyBranchExport } from "@/lib/data/loyalty-branch-report";
import { buildLoyaltyBranchExcel, LOYALTY_BRANCH_EXCEL_MIME } from "@/lib/export/loyalty-branch-excel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const snapshot = await getOwnerLoyaltyBranchExport({ from: params.get("from") ?? "", to: params.get("to") ?? "", branchId: params.get("branch") ?? "", search: params.get("search") ?? "", page: 1 });
    const bytes = await buildLoyaltyBranchExcel(snapshot);
    return new Response(bytes, { headers: { ...headers, "Content-Type": LOYALTY_BRANCH_EXCEL_MIME, "Content-Disposition": `attachment; filename="branda-branch-customers-${snapshot.generatedAt.slice(0, 10)}.xlsx"` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.startsWith("Unauthorized") ? 401 : message.startsWith("Forbidden") ? 403 : error instanceof Error && error.name === "ZodError" ? 400 : 503;
    return Response.json({ ok: false, message: status === 401 ? "انتهت الجلسة سجل الدخول مجددًا" : status === 403 ? "لا تملك صلاحية تصدير تفاصيل عملاء الفروع" : status === 400 ? "تحقق من الفرع والفترة المحددة" : "تعذر تصدير تفاصيل عملاء الفروع حاول مجددًا" }, { status, headers });
  }
}
