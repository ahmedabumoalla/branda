import { NextResponse } from "next/server";
import { getAuthorizedWalletMember } from "@/lib/data/loyalty-experience";
import { getWalletReadiness, issueApplePass } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ cardCode: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { cardCode } = await params;

  try {
    const member = await getAuthorizedWalletMember(cardCode);
    if (!member) return NextResponse.json({ message: "البطاقة غير متاحة. ادخل إلى عضويتك أولًا." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    if (!getWalletReadiness().apple || !member.program.appleWalletEnabled) return NextResponse.json({ message: "حفظ البطاقة في أبل لم يُفعّل بعد." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    const pass = await issueApplePass(member);
    return new Response(new Uint8Array(pass), { headers: { "Content-Type": "application/vnd.apple.pkpass", "Content-Disposition": 'attachment; filename="loyalty.pkpass"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ message: "تعذر إصدار البطاقة الآن. حاول لاحقًا." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
