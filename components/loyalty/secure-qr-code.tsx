"use client";

import QRCode from "qrcode-generator";
import { useMemo } from "react";
import { createBrandaQrPayload, type BrandaQrKind } from "@/lib/loyalty/secure-qr-payload";

type Props = {
  kind: BrandaQrKind;
  value: string;
  title?: string;
  size?: number;
  className?: string;
};

export function SecureQrCode({ kind, value, title, size = 176, className = "" }: Props) {
  const payload = useMemo(() => createBrandaQrPayload(kind, value), [kind, value]);
  const svg = useMemo(() => {
    const qr = QRCode(0, "M");
    qr.addData(payload);
    qr.make();
    return qr.createSvgTag(5, 3);
  }, [payload]);

  return (
    <div className={className} aria-label={title || "Branda secure QR"}>
      <div
        className="mx-auto overflow-hidden rounded-2xl bg-white p-3 text-[#17100d]"
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
