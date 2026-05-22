"use client";

import { ImagePlus, Save, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CAFE_SETTINGS_KEY, mockCafeSettings, type CafeSettings } from "@/lib/mock/cafe-settings";

export function SettingsPageClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CafeSettings>(mockCafeSettings);

  useEffect(() => {
    const saved = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (saved) setSettings(JSON.parse(saved));
  }, []);

  function save() {
    localStorage.setItem(CAFE_SETTINGS_KEY, JSON.stringify(settings));
    alert("تم حفظ إعدادات الكوفي");
  }

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSettings((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
          <h1 className="mt-2 text-4xl font-black text-[#3A2117]">إعدادات الكوفي</h1>
          <p className="mt-2 text-[#7A6255]">الشعار، بيانات الحساب، والوثائق الحكومية الاختيارية.</p>
        </div>

        <button onClick={save} className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-6 py-4 font-black text-[#F8E8D2]">
          <Save className="h-5 w-5" />
          حفظ الإعدادات
        </button>
      </header>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-[#3A2117]">هوية الكوفي</h2>

          <div className="mt-6 rounded-3xl bg-[#F8F4EF] p-6 text-center">
            <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl bg-white">
              {settings.logoDataUrl ? (
                <img src={settings.logoDataUrl} alt="" className="h-full w-full object-contain p-3" />
              ) : (
                <span className="text-5xl font-black text-[#3A2117]">ق</span>
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickLogo} />

            <button
              onClick={() => fileRef.current?.click()}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-[#F8E8D2]"
            >
              <ImagePlus className="h-5 w-5" />
              رفع لوجو الكوفي
            </button>
          </div>
        </aside>

        <div className="grid gap-6">
          <section className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-[#3A2117]">بيانات الحساب</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Input label="اسم الكوفي" value={settings.cafeName} onChange={(v) => setSettings((p) => ({ ...p, cafeName: v }))} />
              <Input label="اسم المسؤول" value={settings.ownerName} onChange={(v) => setSettings((p) => ({ ...p, ownerName: v }))} />
              <Input label="بريد المسؤول" value={settings.ownerEmail} onChange={(v) => setSettings((p) => ({ ...p, ownerEmail: v }))} />
              <Input label="رقم المسؤول" value={settings.ownerPhone} onChange={(v) => setSettings((p) => ({ ...p, ownerPhone: v }))} />
              <Input label="واتساب" value={settings.whatsapp || ""} onChange={(v) => setSettings((p) => ({ ...p, whatsapp: v }))} />
              <Input label="انستقرام" value={settings.instagram || ""} onChange={(v) => setSettings((p) => ({ ...p, instagram: v }))} />
            </div>

            <textarea
              value={settings.description || ""}
              onChange={(e) => setSettings((p) => ({ ...p, description: e.target.value }))}
              placeholder="وصف الكوفي"
              className="mt-4 h-28 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right outline-none"
            />
          </section>

          <section className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-2xl font-black text-[#3A2117]">
              <ShieldCheck className="h-6 w-6" />
              مستندات حكومية اختيارية
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Input label="الرقم الضريبي" value={settings.taxNumber || ""} onChange={(v) => setSettings((p) => ({ ...p, taxNumber: v }))} />
              <Input label="السجل التجاري" value={settings.commercialRegister || ""} onChange={(v) => setSettings((p) => ({ ...p, commercialRegister: v }))} />
              <Input label="شهادة معروف" value={settings.maroofCertificate || ""} onChange={(v) => setSettings((p) => ({ ...p, maroofCertificate: v }))} />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#7A6255]">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 h-14 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right font-bold outline-none" />
    </label>
  );
}