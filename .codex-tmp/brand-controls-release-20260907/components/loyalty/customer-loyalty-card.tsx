"use client";

import { WalletCards } from "lucide-react";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import { LoyaltyBarcode } from "@/components/loyalty/loyalty-card-preview";

type Props = {
  cafeName: string;
  logoUrl?: string | null;
  cardTitle: string;
  cardSubtitle: string;
  cardCode: string;
  purchasesRequired: number;
  completedStamps: number;
  rewardName: string;
  pointsBalance: number;
  pointValueSar: number;
  cardBackground: string;
  cardForeground: string;
  cardAccent: string;
};

export function CustomerLoyaltyCard({
  cafeName,
  logoUrl,
  cardTitle,
  cardSubtitle,
  cardCode,
  purchasesRequired,
  completedStamps,
  rewardName,
  pointsBalance,
  pointValueSar,
  cardBackground,
  cardForeground,
  cardAccent,
}: Props) {
  const valueSar = Math.round(pointsBalance * pointValueSar * 100) / 100;
  const stamps = Array.from({ length: Math.max(1, purchasesRequired) });

  return (
    <div
      className="w-full overflow-hidden rounded-[18px] p-5 shadow-[0_22px_60px_rgba(49,25,18,0.18)]"
      style={{ background: cardBackground, color: cardForeground }}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={cafeName} className="h-12 w-12 shrink-0 rounded-xl bg-white/90 object-contain p-1.5" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-xs font-black opacity-75">{cafeName}</p>
            <h3 className="mt-1 text-2xl font-black leading-tight">{cardTitle}</h3>
            <p className="mt-1 text-xs font-bold leading-5 opacity-80">{cardSubtitle}</p>
          </div>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: cardAccent, color: cardBackground }}>
          <WalletCards className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 rounded-[14px] bg-white/12 p-4">
        <p className="text-sm font-black" style={{ color: cardAccent }}>{rewardName}</p>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {stamps.map((_, index) => (
            <span
              key={index}
              className="flex aspect-square items-center justify-center rounded-xl border text-xs font-black"
              style={
                index < completedStamps
                  ? { background: cardAccent, color: cardBackground, borderColor: "transparent" }
                  : { borderColor: "rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)" }
              }
            >
              {index + 1}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[122px_minmax(0,1fr)]">
        <div className="rounded-[14px] bg-white p-2 text-[#17100d]">
          <SecureQrCode kind="loyalty-card" value={cardCode} title="QR بطاقة الولاء" size={98} />
        </div>
        <div className="grid content-between gap-3">
          <LoyaltyBarcode value={cardCode} dark />
          <div className="grid grid-cols-2 gap-2 text-xs font-black">
            <span className="rounded-xl bg-white/12 px-3 py-2">{pointsBalance} نقطة</span>
            <span className="rounded-xl bg-white/12 px-3 py-2">{valueSar} ر.س</span>
          </div>
        </div>
      </div>
    </div>
  );
}
