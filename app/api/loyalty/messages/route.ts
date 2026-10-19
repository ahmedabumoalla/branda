import { getWalletMessageHistory, MessageHistoryAccessError } from "@/lib/data/wallet-message-history";
import { messageHistoryInputSchema } from "@/lib/loyalty/message-history";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = messageHistoryInputSchema.safeParse({ brandId: params.get("brandId") ?? undefined, page: Number(params.get("page") ?? 0) });
  const headers = { "Cache-Control": "private, no-store" };
  if (!input.success) return Response.json({ message: "طلب سجل الرسائل غير صالح" }, { status: 400, headers });
  try { return Response.json(await getWalletMessageHistory(input.data), { headers }); }
  catch (error) { return Response.json({ message: "تعذر تحميل سجل الرسائل تحقق من صلاحية دخولك ثم أعد المحاولة" }, { status: error instanceof MessageHistoryAccessError ? 403 : 503, headers }); }
}
