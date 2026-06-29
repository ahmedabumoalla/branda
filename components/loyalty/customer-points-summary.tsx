"use client";

import { Coins, ReceiptText, Sparkles, WalletCards } from "lucide-react";

type Props = {
  pointsBalance: number;
  pointValueSar: number;
  usedPoints?: number;
  minimumRedemptionPoints?: number;
  preview?: boolean;
};

const FALLBACK_POINT_VALUE_SAR = 0.25;

const labels = {
  title: "\u0631\u0635\u064a\u062f \u0646\u0642\u0627\u0637 \u0627\u0644\u0648\u0644\u0627\u0621",
  balance: "\u0631\u0635\u064a\u062f \u0627\u0644\u0646\u0642\u0627\u0637",
  totalValue: "\u0642\u064a\u0645\u0629 \u0627\u0644\u0646\u0642\u0627\u0637 \u0628\u0627\u0644\u0631\u064a\u0627\u0644",
  used: "\u0627\u0644\u0646\u0642\u0627\u0637 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0629",
  remaining: "\u0627\u0644\u0646\u0642\u0627\u0637 \u0627\u0644\u0645\u062a\u0628\u0642\u064a\u0629",
  remainingValue: "\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u062a\u0628\u0642\u064a \u0628\u0627\u0644\u0631\u064a\u0627\u0644",
  ready: "\u062c\u0627\u0647\u0632 \u0644\u0644\u0627\u0633\u062a\u0628\u062f\u0627\u0644",
  keepCollecting: "\u0627\u0633\u062a\u0645\u0631 \u0641\u064a \u062c\u0645\u0639 \u0627\u0644\u0646\u0642\u0627\u0637",
  minimum: "\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 \u0644\u0644\u0627\u0633\u062a\u0628\u062f\u0627\u0644",
  point: "\u0646\u0642\u0637\u0629",
  preview: "\u0642\u064a\u0645\u0629 \u062a\u0642\u062f\u064a\u0631\u064a\u0629",
  sar: "\u0631.\u0633",
};

function safeNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPoints(value: number) {
  return Math.round(safeNumber(value)).toLocaleString("ar-SA");
}

function formatSar(value: number) {
  return `${roundCurrency(safeNumber(value)).toLocaleString("ar-SA", {
    maximumFractionDigits: 2,
  })} ${labels.sar}`;
}

export function CustomerPointsSummary({
  pointsBalance,
  pointValueSar,
  usedPoints = 0,
  minimumRedemptionPoints = 100,
  preview = false,
}: Props) {
  const balance = safeNumber(pointsBalance);
  const used = Math.min(balance, safeNumber(usedPoints));
  const remaining = Math.max(0, balance - used);
  const effectivePointValue = safeNumber(pointValueSar, FALLBACK_POINT_VALUE_SAR) || FALLBACK_POINT_VALUE_SAR;
  const totalValueSar = roundCurrency(balance * effectivePointValue);
  const usedValueSar = roundCurrency(used * effectivePointValue);
  const remainingValueSar = roundCurrency(remaining * effectivePointValue);
  const ready = remaining >= minimumRedemptionPoints;
  const valueIsEstimated = preview || !Number.isFinite(pointValueSar) || pointValueSar <= 0;

  const metrics = [
    {
      label: labels.totalValue,
      value: formatSar(totalValueSar),
      hint: valueIsEstimated ? labels.preview : `${formatSar(effectivePointValue)} / ${labels.point}`,
    },
    {
      label: labels.used,
      value: `${formatPoints(used)} ${labels.point}`,
      hint: formatSar(usedValueSar),
    },
    {
      label: labels.remaining,
      value: `${formatPoints(remaining)} ${labels.point}`,
      hint: formatSar(remainingValueSar),
    },
    {
      label: labels.remainingValue,
      value: formatSar(remainingValueSar),
      hint: `${labels.minimum} ${formatPoints(minimumRedemptionPoints)} ${labels.point}`,
    },
  ];

  return (
    <section
      aria-label={labels.title}
      className="overflow-hidden rounded-[18px] border border-[#E7D7C6] bg-[#FFFCF7] shadow-[0_16px_42px_rgba(49,25,18,0.08)]"
      dir="rtl"
    >
      <div className="flex flex-col gap-3 border-b border-[#EADCCC] bg-gradient-to-l from-[#FFF7E6] to-[#FDF6EF] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#6B3A25] text-[#FFF8EA]">
            <Coins className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black text-[#6B3A25]">{labels.title}</p>
            <p className="mt-1 text-2xl font-black leading-none text-[#311912]">
              {formatPoints(balance)} <span className="text-sm">{labels.point}</span>
            </p>
          </div>
        </div>
        <div
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${
            ready ? "bg-[#EAF7EF] text-[#2F7A52]" : "bg-[#FFF1D2] text-[#8A5A12]"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {ready ? labels.ready : labels.keepCollecting}
        </div>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {metrics.map((metric, index) => {
          const Icon = index === 0 ? WalletCards : index === 1 ? ReceiptText : Coins;
          return (
            <div
              key={metric.label}
              className="min-w-0 rounded-[14px] border border-[#EFE1D1] bg-white px-3 py-2.5"
            >
              <div className="flex items-center gap-2 text-[#806A5E]">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-[11px] font-black">{metric.label}</span>
              </div>
              <p className="mt-1 truncate text-base font-black text-[#311912]">{metric.value}</p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-[#9A7C66]">{metric.hint}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
