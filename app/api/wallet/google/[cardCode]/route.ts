import { NextResponse } from "next/server";
import { getAuthorizedWalletMember } from "@/lib/data/loyalty-experience";
import { getWalletReadiness, issueGoogleSaveUrl } from "@/lib/wallet";

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
    if (!getWalletReadiness().google || !member.program.googleWalletEnabled) return NextResponse.json({ message: "حفظ البطاقة في قوقل لم يُفعّل بعد." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    const url = await issueGoogleSaveUrl(member);
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ message: "تعذر إصدار البطاقة الآن. حاول لاحقًا." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
