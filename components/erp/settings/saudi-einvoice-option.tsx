"use client";

import { FileCheck2, LockKeyhole } from "lucide-react";
import type { SystemSettingsSnapshot } from "@/lib/erp/settings";
import styles from "./saudi-einvoice-option.module.css";

export function SaudiEinvoiceOption({ policy, value, disabled, onChange }: {
  policy: SystemSettingsSnapshot["saudiEinvoice"];
  value?: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const available = policy?.available === true;
  const enabled = value ?? policy?.enabled ?? true;
  return <section className={styles.card} aria-labelledby="saudi-einvoice-heading">
    <div className={styles.identity}>
      <span className={styles.icon} aria-hidden="true"><FileCheck2 size={23} /></span>
      <div><span className={styles.eyebrow}>خيارات المبيعات</span><h3 id="saudi-einvoice-heading">الفاتورة الإلكترونية السعودية</h3><p>عند التفعيل تُقفل تعديلات بنود الفواتير الصادرة</p></div>
    </div>
    <label className={styles.switchLabel}>
      <input type="checkbox" role="switch" checked={enabled} disabled={disabled || !available} onChange={event => onChange(event.target.checked)} aria-label="تفعيل الفاتورة الإلكترونية السعودية" aria-describedby="saudi-einvoice-note" />
      <span>{available ? enabled ? "مفعلة" : "غير مفعلة" : "غير متاحة حاليًا"}</span>
    </label>
    <p id="saudi-einvoice-note" className={styles.note}><LockKeyhole size={15} aria-hidden="true" /><span>{!available ? policy?.message || "تعذر التحقق من إعداد الفوترة أعد تحميل الإعدادات" : "الفواتير الضريبية الصادرة محفوظة كما أُصدرت ولا يغير تعطيل الخيار بياناتها السابقة"}</span></p>
  </section>;
}
