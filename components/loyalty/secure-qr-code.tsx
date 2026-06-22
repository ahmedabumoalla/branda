"use client";

import QRCode from "qrcode-generator";
import { useMemo } from "react";
import { createBarndaksaQrPayload, type BarndaksaQrKind } from "@/lib/loyalty/secure-qr-payload";

type Props = {
  kind: BarndaksaQrKind;
  value: string;
  title?: string;
  size?: number;
  className?: string;
};

function normalizeQrValue(kind: BarndaksaQrKind, value: string) {
  const normalized = value.trim().toUpperCase();

  // بطاقة الولاء تحتاج قراءة سريعة وموثوقة من كاميرا الكاشير، لذلك تكون QR قصيرة بالكود نفسه.
  // باقي أنواع QR تبقى بصيغة Barndaksa الآمنة لأنها ليست مرتبطة بعملية شراء مباشرة من بطاقة الولاء.
  if (kind === "loyalty-card") {
    return normalized;
  }

  return createBarndaksaQrPayload(kind, normalized);
}

export function SecureQrCode({ kind, value, title, size = 176, className = "" }: Props) {
  const payload = useMemo(() => normalizeQrValue(kind, value), [kind, value]);
  const svg = useMemo(() => {
    const qr = QRCode(0, "Q");
    qr.addData(payload);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const quietZone = 4;
    const totalSize = moduleCount + quietZone * 2;
    const cells: string[] = [];

    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (!qr.isDark(row, col)) continue;
        cells.push(
          `<rect x="${col + quietZone}" y="${row + quietZone}" width="1" height="1" />`,
        );
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="100%" height="100%" shape-rendering="crispEdges"><rect width="${totalSize}" height="${totalSize}" fill="#fff" /> <g fill="#17100d">${cells.join("")}</g></svg>`;
  }, [payload]);

  return (
    <div className={className} aria-label={title || "Barndaksa secure QR"} data-qr-value={payload}>
      <div
        className="mx-auto rounded-2xl bg-white p-3 text-[#17100d]"
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
