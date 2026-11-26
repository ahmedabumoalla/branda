import { walletInLanguage } from "@/lib/wallet/language";
import { after, NextResponse } from "next/server";
import { welcomeAfterWalletDownload } from "@/lib/wallet/welcome";
import { getAuthorizedWalletMember } from "@/lib/data/loyalty-experience";
import { getWalletReadiness, issueApplePass } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = {
  params: Promise<{ cardCode: string }>;
};

export async function GET(request: Request, { params }: Props) {
  const { cardCode } = await params;
  const requested = new URL(request.url).searchParams.get("lang");

  try {
    const member = await getAuthorizedWalletMember(cardCode);
    if (!member) return NextResponse.json({ message: requested === "en" ? "Open your membership to access this card" : "البطاقة غير متاحة ادخل إلى عضويتك أولًا" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    if (!getWalletReadiness().apple || !member.program.appleWalletEnabled) return NextResponse.json({ message: requested === "en" ? "This wallet is currently unavailable" : "حفظ البطاقة في أبل لم يُفعّل بعد" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    const pass = await issueApplePass(await walletInLanguage(member, requested));
    after(() => welcomeAfterWalletDownload(member.card.id));
    return new Response(new Uint8Array(pass), { headers: { "Content-Type": "application/vnd.apple.pkpass", "Content-Disposition": 'attachment; filename="loyalty.pkpass"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ message: requested === "en" ? "Unable to issue the card. Please try again later" : "تعذر إصدار البطاقة الآن حاول لاحقًا" }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
