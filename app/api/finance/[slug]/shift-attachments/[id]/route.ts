import { NextResponse } from "next/server";
import { downloadShiftAttachment, finalizeShiftAttachment } from "@/lib/data/finance-shift-attachments";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
type Context = { params: Promise<{ slug: string; id: string }> };
export async function POST(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try {
    const { slug, id } = await params;
    return NextResponse.json(await finalizeShiftAttachment(slug, id), { headers });
  } catch { return NextResponse.json({ error: "لم يكتمل حفظ المرفق تحقق من الرفع وصلاحية الوردية" }, { status: 400, headers }); }
}
export async function GET(_request: Request, { params }: Context) {
  try {
    const { slug, id } = await params;
    return NextResponse.redirect(await downloadShiftAttachment(slug, id), { status: 307, headers });
  } catch { return NextResponse.json({ error: "المرفق غير متاح" }, { status: 403, headers }); }
}
