"use client";

import { useParams } from "next/navigation";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";

export default function MenuError({ retry }: { retry: () => void }) {
  const { slug } = useParams<{ slug: string }>();
  const store = isFawaselStore(slug) || slug === "khayal-aldeem" || slug === "brand-871ec6e243c0";
  return <main dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#111310] px-6 text-center text-[#F3EEE3]">
    <h1 className="text-2xl font-bold">{store ? "تعذر تحميل المتجر" : "تعذر تحميل المنيو"}</h1>
    <p>حاول مرة أخرى بعد قليل</p>
    <button onClick={retry} className="min-h-12 rounded-full bg-[#CFAB76] px-8 py-3 text-[#111310]">إعادة المحاولة</button>
  </main>;
}
