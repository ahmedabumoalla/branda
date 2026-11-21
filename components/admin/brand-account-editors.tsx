"use client";
import { useState } from "react";
import { PencilLine } from "lucide-react";
import type { PlatformCafe } from "@/lib/platform/admin-data";
import { BrandOwnerEditor } from "./brand-owner-editor";
import { BrandProfileEditor } from "./brand-profile-editor";
import s from "./brand-onboarding.module.css";

/** Lets the administrator edit the brand data and the owner login data of any account from the brand file */
export function BrandAccountEditors({ cafe, disabled, onBusyChange, onUpdated }: { cafe: PlatformCafe; disabled: boolean; onBusyChange: (busy: boolean) => void; onUpdated: (cafe: PlatformCafe) => void }) {
  const [open, setOpen] = useState<"brand" | "owner" | null>(null);
  const [message, setMessage] = useState("");
  return <div className={s.editors}>
    {open === null && <div className={s.actions}>
      <button type="button" className={s.secondary} disabled={disabled} onClick={() => { setOpen("brand"); setMessage(""); }}><PencilLine size={17} aria-hidden="true" />تعديل بيانات العلامة</button>
      <button type="button" className={s.secondary} disabled={disabled} onClick={() => { setOpen("owner"); setMessage(""); }}><PencilLine size={17} aria-hidden="true" />تعديل بيانات المالك والدخول</button>
    </div>}
    {open === "brand" && <BrandProfileEditor cafe={cafe} disabled={disabled} onBusyChange={onBusyChange} close={() => setOpen(null)}
      onSaved={next => { onUpdated(next); setMessage("تم حفظ بيانات العلامة"); }} />}
    {open === "owner" && <BrandOwnerEditor cafe={cafe} disabled={disabled} onBusyChange={onBusyChange} close={() => setOpen(null)}
      onSaved={(next, contactOnly) => { onUpdated(next); setMessage(contactOnly ? "تم الحفظ هذا الحساب يدخل ببريده الإلكتروني فالجوال والبريد هنا للتواصل فقط وكلمة المرور الجديدة تسري على دخوله" : "تم حفظ بيانات المالك والدخول"); }} />}
    <p className={s.saved} role="status">{message}</p>
  </div>;
}
