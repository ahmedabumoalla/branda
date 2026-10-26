import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeBrandFinanceCommand, getBrandFinanceSnapshot } from "@/lib/data/brand-finance";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const fail = (message: string, kind: "auth" | "conflict" | "retry", status: number) => NextResponse.json({ ok: false, kind, message }, { status, headers });
async function authorize(slug: string) {
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError && (!authError.status || authError.status >= 500)) throw new Error("unavailable");
  if (!user) return null;
  const { data, error } = await client.rpc("brand_finance_context", { p_slug: slug });
  if (error?.code === "42501") return null;
  if (error) throw new Error("unavailable");
  return { user, cafe: data as { id: string } };
}
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!await authorize(slug)) return fail("سجل الدخول مجددًا لإكمال المزامنة بيانات الجهاز محفوظة", "auth", 401);
    return NextResponse.json({ ok: true, snapshot: await getBrandFinanceSnapshot(slug) }, { headers });
  } catch { return fail("الخدمة غير متاحة مؤقتًا ستستأنف المزامنة تلقائيًا", "retry", 503); }
}
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("طلب غير مسموح", "auth", 403);
  const { slug } = await params;
  let context: Awaited<ReturnType<typeof authorize>>;
  try { context = await authorize(slug); } catch { return fail("الخدمة غير متاحة مؤقتًا ستستأنف المزامنة تلقائيًا", "retry", 503); }
  if (!context) return fail("سجل الدخول مجددًا لإكمال المزامنة بيانات الجهاز محفوظة", "auth", 401);
  let body: { userId?: string; cafeId?: string; command?: { operation?: string; payload?: Record<string, unknown> } };
  try {
    const raw = await request.text(); if (raw.length > 120_000) return fail("بيانات الفاتورة أكبر من المسموح", "conflict", 400);
    body = JSON.parse(raw);
  } catch { return fail("بيانات الفاتورة غير صالحة", "conflict", 400); }
  if (body.userId !== context.user.id || body.cafeId !== context.cafe.id) return fail("سجل الدخول بنفس حساب الموظف الذي حفظ هذه الفواتير", "auth", 403);
  if (body.command?.operation !== "sale") return fail("هذا المسار مخصص لمزامنة المبيعات", "conflict", 400);
  // The existing transaction enforces current tenant/staff/shift/price/stock rules and request-id deduplication.
  try {
    const data = await executeBrandFinanceCommand(body.command, slug);
    const snapshot = await getBrandFinanceSnapshot(slug).catch(() => undefined);
    return NextResponse.json({ ok: true, data, snapshot }, { headers });
  } catch (error) {
    if (error instanceof Error && error.name === "FinanceUnavailable") return fail(error.message, "retry", 503);
    const message = error instanceof Error && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 400 ? error.message : "تعذر مزامنة الفاتورة راجع البيانات ثم أعد المحاولة";
    // Administrative pause is reversible; keep queued invoices retryable on resume.
    return fail(message, message.includes("الوردية موقوفة إداريًا") ? "retry" : "conflict", 409);
  }
}
