"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import styles from "./finance-pos-actions.module.css";

export function FinancePosActions({ children, details }: { children: ReactNode; details?: ReactNode }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const element = disclosure.current;
      if (element?.open && event.target instanceof Node && !element.contains(event.target)) element.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <details ref={disclosure} className={styles.disclosure}
    onKeyDown={(event) => {
      if (event.key === "Escape" && event.currentTarget.open) {
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}
    onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}>
    <summary className={styles.trigger}><SlidersHorizontal size={17} aria-hidden="true" /><span>إجراءات الكاشير</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div className={styles.panel}>
      {details && <div className={styles.meta}>{details}</div>}
      <div className={styles.controls} onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button:not(:disabled), a[href]") && disclosure.current) disclosure.current.open = false;
      }}>{children}</div>
    </div>
  </details>;
}
