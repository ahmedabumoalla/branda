"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import shared from "./finance.module.css";
import styles from "./finance-inventory-item-form.module.css";

export function FinanceInventoryBarcode({ value, name }: { value: string; name: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void import("jsbarcode").then(({ default: render }) => {
      if (cancelled || !svg.current) return;
      render(svg.current, value, { format: "CODE128", width: 2, height: 64, margin: 20, fontSize: 16, background: "#ffffff", lineColor: "#000000", displayValue: true });
      setReady(true);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [value]);
  return <div className={styles.barcode}><span>الباركود المحفوظ للصنف {name}</span><div className={styles.barcodeScroll}><svg ref={svg} role="img" aria-label={`باركود ${value}`} /></div>
    {error && <span role="alert">تعذر إنشاء صورة الباركود</span>}
    <button type="button" className={shared.secondary} disabled={!ready} onClick={() => {
      if (!svg.current) return;
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg.current)], { type: "image/svg+xml;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "inventory-barcode.svg"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}><Download size={16} />تنزيل الباركود للطباعة</button>
  </div>;
}
