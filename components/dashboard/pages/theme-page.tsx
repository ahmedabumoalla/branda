"use client";

import { Check, Palette } from "lucide-react";
import { useEffect, useState } from "react";
import { CAFE_THEME_KEY, cafeThemes, type CafeThemeId } from "@/lib/mock/cafe-theme";

export function ThemePageClient() {
  const [activeTheme, setActiveTheme] = useState<CafeThemeId>("classic");

  useEffect(() => {
    const saved = localStorage.getItem(CAFE_THEME_KEY) as CafeThemeId | null;
    if (saved) setActiveTheme(saved);
  }, []);

  function activate(theme: CafeThemeId) {
    setActiveTheme(theme);
    localStorage.setItem(CAFE_THEME_KEY, theme);
    alert("تم تفعيل الثيم على صفحة الكوفي");
  }

  return (
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8">
        <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
        <h1 className="mt-2 text-4xl font-black text-[#3A2117]">ثيم الكوفي</h1>
        <p className="mt-2 text-[#7A6255]">غيّر شكل صفحة الكوفي مع الحفاظ على نفس الخدمات والمنطق.</p>
      </header>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {cafeThemes.map((theme) => (
          <article key={theme.id} className="rounded-3xl border border-[#E5D8CD] bg-white p-5 shadow-sm">
            <div className={`h-44 rounded-3xl ${theme.preview} border border-[#E5D8CD]`} />

            <div className="mt-5">
              <h2 className="text-2xl font-black text-[#3A2117]">{theme.name}</h2>
              <p className="mt-2 min-h-12 text-sm font-bold text-[#7A6255]">{theme.description}</p>

              <button
                onClick={() => activate(theme.id)}
                className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-black ${
                  activeTheme === theme.id
                    ? "bg-green-50 text-green-700"
                    : "bg-[#3A2117] text-[#F8E8D2]"
                }`}
              >
                {activeTheme === theme.id ? <Check className="h-5 w-5" /> : <Palette className="h-5 w-5" />}
                {activeTheme === theme.id ? "مفعل" : "تفعيل الثيم"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}