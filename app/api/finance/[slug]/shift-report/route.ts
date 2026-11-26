import { NextResponse } from "next/server";
import { getPosShiftReport } from "@/lib/data/finance-pos-shift-report";
import { isHospitalStore } from "@/lib/commerce/hospital-profile";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!isHospitalStore(slug)) return new Response(null, { status: 404, headers });
  try {
    const shiftId = new URL(request.url).searchParams.get("shift") ?? "";
    return NextResponse.json(await getPosShiftReport(shiftId, slug, true), { headers });
  } catch {
    return NextResponse.json({ message: "تعذر تحميل تقرير الوردية لهذا الحساب" }, { status: 403, headers });
  }
}
