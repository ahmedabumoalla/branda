import { NextResponse } from "next/server";

type Props = {
  params: Promise<{ cardCode: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { cardCode } = await params;

  return NextResponse.json({
    status: "wallet_credentials_required",
    provider: "apple_wallet",
    cardCode,
    next: "أضف Apple Pass Type ID وملف p12 وWWDR حتى يتم توليد ملف pkpass فعلي",
  });
}
