"use client";
import QRCode from "qrcode-generator";

export function EnrollmentQr({ url, name }: { url: string; name: string }) {
  const qr = QRCode(0, "M"); qr.addData(url); qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  return <div role="img" aria-label={`باركود الانضمام إلى ولاء ${name}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function downloadEnrollmentQr(url: string, name: string) {
  const qr = QRCode(0, "M"); qr.addData(url); qr.make();
  const blob = new Blob([qr.createSvgTag({ cellSize: 8, margin: 32 })], { type: "image/svg+xml;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = href; link.download = `${name}-loyalty-qr.svg`; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
