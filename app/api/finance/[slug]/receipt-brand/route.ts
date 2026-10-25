import { NextResponse } from "next/server";
import { getFinanceReceiptBrand } from "@/lib/data/finance-receipt-brand";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    return NextResponse.json(await getFinanceReceiptBrand((await params).slug), { headers });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل شعار العلامة تحقق من الاتصال وصلاحية الدخول ثم أعد المحاولة" }, { status: 403, headers });
  }
}
