"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { labRecordCategories, labSafetyProfileSchema, type LabSafetyProfile, type LabSafetyProfileInput, type LabSnapshot } from "@/lib/erp/lab-orders";
import s from "./lab-workspace.module.css";

export const recordLabels: Record<typeof labRecordCategories[number], string> = {
  supplier: "المورد واستلام المواد الخام", cleaning: "النظافة والتطهير", temperature: "درجات الحرارة والمعايرة", packaging: "التغليف والبطاقة الغذائية", lab_test: "نتائج الفحوص المخبرية", staff_health: "الشهادات الصحية وتدريب العاملين", pest_control: "مكافحة الآفات",
};

export function approvedOrderProfiles(productIds: string[], profiles: LabSafetyProfile[]) {
  const selected = [...new Set(productIds)].map(id => profiles.find(profile => profile.productId === id && profile.enabled));
  const missing = selected.some(profile => !profile);
  const approved = selected.filter((profile): profile is LabSafetyProfile => !!profile);
  const minimum = approved.length ? Math.max(...approved.map(profile => profile.minimumTemperature)) : NaN;
  const maximum = approved.length ? Math.min(...approved.map(profile => profile.maximumTemperature)) : NaN;
  return { approved, minimum, maximum, missing, incompatible: !missing && minimum > maximum, records: [...new Set(approved.flatMap(profile => profile.requiredRecords))] };
}

export function LabSafetyProfiles({ data, pending, onSave }: { data: LabSnapshot; pending: boolean; onSave: (input: LabSafetyProfileInput) => void }) {
  const [productId, setProductId] = useState("");
  const current = data.safetyProfiles.find(profile => profile.productId === productId);
  return <details className={s.operators}><summary><ShieldCheck size={18} aria-hidden="true" /> ملفات سلامة المنتجات المعتمدة</summary><p className={s.hint}>يعتمد المالك أو المدير وصفة المنتج وحدود العملية ومراجع السجلات المطلوبة وفق خطة المنشأة قبل اعتماد أي تجهيز</p><label className={s.field}>اختر المنتج<select value={productId} onChange={event => setProductId(event.target.value)}><option value="">اختر منتجًا لإعداد ملفه</option>{data.products.map(product => <option value={product.id} key={product.id}>{product.name}{data.safetyProfiles.some(profile => profile.productId === product.id && profile.enabled) ? " — معتمد" : " — يحتاج اعتمادًا"}</option>)}</select></label>{productId && <SafetyProfileForm key={`${productId}-${current?.revision ?? 0}`} productId={productId} profile={current} pending={pending} onSave={onSave} />}</details>;
}

function SafetyProfileForm({ productId, profile, pending, onSave }: { productId: string; profile?: LabSafetyProfile; pending: boolean; onSave: (input: LabSafetyProfileInput) => void }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const input = { productId, revision: profile?.revision ?? 0, enabled: form.get("enabled") === "on", recipeVersion: String(form.get("recipeVersion")), processReference: String(form.get("processReference")), minimumTemperature: Number(form.get("minimumTemperature")), maximumTemperature: Number(form.get("maximumTemperature")), allergens: String(form.get("allergens")), storageInstructions: String(form.get("storageInstructions")), maxShelfLifeDays: Number(form.get("maxShelfLifeDays")), requiredRecords: form.getAll("requiredRecords") };
    const parsed = labSafetyProfileSchema.safeParse(input);
    if (!parsed.success) { setError("أكمل بيانات الوصفة وحدود الحرارة والصلاحية وحدد السجلات المطلوب توثيقها"); return; }
    setError(""); onSave(parsed.data);
  }
  return <form onSubmit={submit} style={{ marginTop: 20 }}>{error && <p role="alert" className={s.error}>{error}</p>}<div className={s.formGrid}>
    <label className={s.field}>إصدار الوصفة<input name="recipeVersion" required maxLength={100} defaultValue={profile?.recipeVersion ?? ""} /></label>
    <label className={s.field}>مرجع الخطة المعتمدة<input name="processReference" required maxLength={500} defaultValue={profile?.processReference ?? ""} /></label>
    <label className={s.field}>الحد الأدنى المعتمد °م<input name="minimumTemperature" required type="number" min="-100" max="400" step="0.01" defaultValue={profile?.minimumTemperature ?? ""} /></label>
    <label className={s.field}>الحد الأعلى المعتمد °م<input name="maximumTemperature" required type="number" min="-100" max="400" step="0.01" defaultValue={profile?.maximumTemperature ?? ""} /></label>
    <label className={s.field}>أقصى صلاحية بالأيام<input name="maxShelfLifeDays" required type="number" min="1" max="3660" step="1" defaultValue={profile?.maxShelfLifeDays ?? ""} /><small>وفق الدراسة أو المواصفة المعتمدة للمنتج وليس قيمة تقديرية</small></label>
    <label className={s.field}>مسببات الحساسية<textarea name="allergens" required maxLength={1000} defaultValue={profile?.allergens ?? ""} /></label>
    <label className={`${s.field} ${s.wide}`}>تعليمات الحفظ والنقل<textarea name="storageInstructions" required maxLength={1000} defaultValue={profile?.storageInstructions ?? ""} /></label>
  </div><h3 className={s.sectionTitle}>السجلات التي يلزم إرفاق مراجعها بكل تجهيز</h3><div className={s.checkGrid}>{labRecordCategories.map(key => <label className={s.check} key={key}><input type="checkbox" name="requiredRecords" value={key} defaultChecked={profile?.requiredRecords.includes(key) ?? false} />{recordLabels[key]}</label>)}</div><label className={s.check} style={{ marginTop: 18 }}><input type="checkbox" name="enabled" defaultChecked={profile?.enabled ?? false} />اعتماد هذا الملف للاستخدام في المعمل</label><footer className={s.formFooter}><span className={s.hint}>يحفظ النظام نسخة الملف المستخدمة مع كل طلب تم تجهيزه</span><button className={s.primary} disabled={pending}>{pending ? "جار الحفظ" : "حفظ ملف سلامة المنتج"}</button></footer></form>;
}
