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
    return qr.createSvgTag(5, 3);
  }, [payload]);

  return (
    <div className={className} aria-label={title || "Barndaksa secure QR"} data-qr-value={payload}>
      <div
        className="mx-auto overflow-hidden rounded-2xl bg-white p-3 text-[#17100d]"
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
