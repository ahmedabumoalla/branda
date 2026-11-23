import { getBrandContactReport } from "@/lib/data/admin-brand-contact-report";
import { buildBrandContactExcel } from "@/lib/export/brand-contact-excel";
import { BRAND_EXCEL_MIME } from "@/lib/export/brand-directory-excel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const report = await getBrandContactReport();
    const excel = await buildBrandContactExcel(report);
    const filename = `branda-activation-follow-up-${report.exportedAt.slice(0, 10)}.xlsx`;
    return new Response(excel, { headers: { ...headers, "Content-Type": BRAND_EXCEL_MIME,
      "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Brand contact report not installed") {
      return Response.json({ ok: false, code: "report_not_installed" }, { status: 503, headers });
    }
    const status = message === "Unauthorized" ? 401 : message.startsWith("Forbidden") ? 403 : 503;
    const userMessage = status === 401 ? "انتهت الجلسة سجل الدخول مجددًا"
      : status === 403 ? "تقرير متابعة التفعيل متاح لمدير المنصة فقط" : "تعذر تجهيز تقرير متابعة التفعيل حاول مجددًا";
    return Response.json({ ok: false, message: userMessage }, { status, headers });
  }
}
