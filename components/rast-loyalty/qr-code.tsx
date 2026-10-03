"use client";

import { useMemo } from "react";
import QRCode from "qrcode-generator";

export function RastQrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const qr = useMemo(() => {
    const code = QRCode(0, "M");
    code.addData(value);
    code.make();
    const size = code.getModuleCount();
    const paths: string[] = [];
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        if (code.isDark(row, column)) paths.push(`M${column + 4} ${row + 4}h1v1h-1z`);
      }
    }
    return { size: size + 8, path: paths.join("") };
  }, [value]);
  return <svg className={className} role="img" aria-label={label} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
    <rect width={qr.size} height={qr.size} fill="#ffffff" />
    <path d={qr.path} fill="#291017" />
  </svg>;
}
