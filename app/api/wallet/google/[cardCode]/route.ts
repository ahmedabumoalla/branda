import { NextResponse } from "next/server";

type Props = {
  params: Promise<{ cardCode: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { cardCode } = await params;

  return NextResponse.json({
    status: "wallet_credentials_required",
    provider: "google_wallet",
    cardCode,
    next: "أضف Google Issuer ID وService Account JSON حتى يتم إصدار البطاقة فعليًا",
  });
}
