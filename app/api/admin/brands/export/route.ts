import { getAdminBrandExportSnapshot } from "@/lib/data/admin-brand-export";
import { BRAND_EXCEL_MIME, buildBrandDirectoryExcel } from "@/lib/export/brand-directory-excel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const snapshot = await getAdminBrandExportSnapshot();
    const bytes = await buildBrandDirectoryExcel(snapshot);
    const filename = `branda-brands-${snapshot.exportedAt.slice(0, 10)}.xlsx`;
    return new Response(bytes, { headers: { ...headers, "Content-Type": BRAND_EXCEL_MIME, "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "Unauthorized" ? 401 : message.startsWith("Forbidden") ? 403 : 503;
    return Response.json({ ok: false, message: status === 401 ? "انتهت الجلسة سجل الدخول مجددًا" : status === 403 ? "تصدير العلامات متاح لمدير المنصة فقط" : "تعذر تصدير العلامات التجارية حاول مجددًا" }, { status, headers });
  }
}
