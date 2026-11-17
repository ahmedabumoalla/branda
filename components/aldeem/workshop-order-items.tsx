"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import renderBarcode from "jsbarcode";
import { ImageOff } from "lucide-react";
import type { WorkshopProduct } from "@/lib/aldeem/workshop";
import s from "./workshop-order-items.module.css";

export function WorkshopProductPhoto({ name, imageUrl, illustrative = false }: { name: string; imageUrl?: string | null; illustrative?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <div className={s.photo}>
    {imageUrl && imageUrl !== failedUrl ? <Image src={imageUrl} alt={illustrative ? `صورة توضيحية ${name}` : name} width={176} height={144} unoptimized loading="lazy" onError={() => setFailedUrl(imageUrl)} /> : <div className={s.missing}><ImageOff size={28} aria-hidden="true" /><span>{imageUrl ? "تعذر تحميل الصورة" : "لا توجد صورة مسجلة"}</span></div>}
    {illustrative && imageUrl && imageUrl !== failedUrl && <span className={s.caption}>صورة توضيحية</span>}
  </div>;
}

function ProductBarcode({ code }: { code: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!svg.current) return;
    try {
      renderBarcode(svg.current, code, { format: "CODE128", width: 2, height: 54, margin: 14, displayValue: false, background: "#ffffff", lineColor: "#000000" });
      setError(false);
    } catch { svg.current.replaceChildren(); setError(true); }
  }, [code]);
  return <div className={s.barcode} dir="ltr"><div className={s.bars} tabIndex={0} role="region" aria-label={`باركود الصنف ${code}`}><svg ref={svg} role="img" aria-label={`باركود ${code}`} /></div><bdi className={s.code}>{code}</bdi>{error && <span className={s.barcodeError}>تعذر رسم الباركود راجع الرقم المسجل</span>}</div>;
}

export function WorkshopOrderItems({ lines, illustrative = false }: { lines: (WorkshopProduct & { quantity: number })[]; illustrative?: boolean }) {
  return <ul className={s.list} aria-label="صور وباركود أصناف الطلب">{lines.map(line => <li key={line.id} className={s.item}>
    <WorkshopProductPhoto name={line.name} imageUrl={line.imageUrl} illustrative={illustrative} />
    <div className={s.info}><h4>{line.name}</h4><p>{[line.flavor, line.shape, line.packaging].filter(Boolean).join(" / ") || "المواصفات غير مسجلة"}</p><span className={s.sku}>رقم الصنف <bdi>{line.sku || "غير مسجل"}</bdi></span><div className={s.quantity}><span>الكمية المطلوبة</span><strong>{line.quantity.toLocaleString("ar-SA", { maximumFractionDigits: 3 })} <small>{line.unit}</small></strong></div></div>
    <div className={s.identity}><span className={s.label}>باركود الصنف</span>{line.barcode ? <ProductBarcode key={line.barcode} code={line.barcode} /> : <p className={s.noBarcode}>لا يوجد باركود مسجل لهذا الصنف</p>}</div>
  </li>)}</ul>;
}
