"use client";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "@/components/erp/navigation";
import { X } from "lucide-react";
import s from "./aldeem-ui.module.css";

export { s as aldeem };
export const money = (value: number) => new Intl.NumberFormat("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
export const quantity = (value: number) => new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 3 }).format(Number(value) || 0);
export const day = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "";
export const dayTime = (value: string) => new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

/** The small question mark beside a control: hover or focus shows what the control does */
export function Help({ text, side }: { text: string; side?: "start" | "end" }) {
  const id = useId();
  return <span className={s.help} tabIndex={0} role="img" aria-label={`شرح: ${text}`} aria-describedby={id}>
    ؟<span id={id} role="tooltip" className={s.tip} data-side={side}>{text}</span>
  </span>;
}

type ActionProps = ButtonHTMLAttributes<HTMLButtonElement> & { help: string; tone?: "primary" | "danger"; small?: boolean; side?: "start" | "end"; children: ReactNode };
/** Every Aldeem button carries its explanation */
export function Action({ help, tone, small, side, className, children, type = "button", ...rest }: ActionProps) {
  return <span className={s.action} data-no-help>
    <button type={type} className={[s.button, tone === "primary" ? s.primary : tone === "danger" ? s.danger : "", small ? s.small : "", className ?? ""].join(" ")} {...rest}>{children}</button>
    <Help text={help} side={side} />
  </span>;
}

/** A link that looks and explains itself like a button */
export function LinkAction({ href, help, tone, small, side, external, children }: { href: string; help: string; tone?: "primary"; small?: boolean; side?: "start" | "end"; external?: boolean; children: ReactNode }) {
  const className = [s.button, tone === "primary" ? s.primary : "", small ? s.small : ""].join(" ");
  return <span className={s.action} data-no-help>
    {external ? <a href={href} className={className}>{children}</a> : <Link href={href} className={className}>{children}</Link>}
    <Help text={help} side={side} />
  </span>;
}

export function Dialog({ open, title, subtitle, wide, onClose, children }: { open: boolean; title: string; subtitle?: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} className={s.dialog} data-wide={wide || undefined} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className={s.dialogForm}>
      <header className={s.dialogHead}>
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className={s.close} onClick={onClose} aria-label="إغلاق النافذة"><X size={16} aria-hidden="true" /></button>
      </header>
      {children}
    </div>
  </dialog>;
}

export function Field({ label, help, hint, children }: { label: string; help?: string; hint?: string; children: ReactNode }) {
  return <label className={s.field}><span>{label}{help && <Help text={help} side="start" />}</span>{children}{hint && <small>{hint}</small>}</label>;
}
