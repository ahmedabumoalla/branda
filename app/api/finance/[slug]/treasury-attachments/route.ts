import { listTreasuryAttachments, prepareTreasuryAttachment } from "@/lib/data/finance-treasury-attachments";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    return Response.json({ attachments: await listTreasuryAttachments(slug, new URL(request.url).searchParams.get("documentId") ?? "") }, { headers });
  } catch { return Response.json({ error: "تعذر تحميل مرفقات السند أو لا تملك صلاحية الوصول" }, { status: 403, headers }); }
}
export async function POST(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  if (Number(request.headers.get("content-length")) > 4096) return new Response(null, { status: 413, headers });
  try {
    const body = await request.text();
    if (body.length > 4096) return new Response(null, { status: 413, headers });
    const { slug } = await params;
    return Response.json(await prepareTreasuryAttachment(slug, JSON.parse(body)), { headers });
  } catch { return Response.json({ error: "تعذر تجهيز المرفق تحقق من الاتصال وصلاحية السند وحد الرفع" }, { status: 400, headers }); }
}
