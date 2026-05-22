"use client";

import Link from "next/link";
import { useState } from "react";

const slides = [
  {
    title: "منيو رقمي\nوتجربة أذكى",
    desc: "للحجوزات، الطلبات، ونقاط الولاء",
    cardTitle: "لاتيه فانيلا",
    cardDesc: "مشروب مميز للعملاء",
    stat: "1,240",
    tag: "الأكثر طلبًا",
  },
  {
    title: "حجوزات الطاولات\nبسهولة",
    desc: "نظّم الطاولات، الأوقات، وعدد الضيوف",
    cardTitle: "طاولة بإطلالة",
    cardDesc: "حجز مميز داخل الكافيه",
    stat: "86",
    tag: "حجز اليوم",
  },
  {
    title: "نقاط ولاء\nتزيد عودة العملاء",
    desc: "كافئ العملاء وخلّيهم يرجعون أكثر",
    cardTitle: "عميل ذهبي",
    cardDesc: "مكافآت وخصومات ذكية",
    stat: "540",
    tag: "نقطة مكتسبة",
  },
];

export default function HomePage() {
  const [active, setActive] = useState(0);
  const slide = slides[active];

  return (
    <main dir="rtl" className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[#F8F4EF] text-[#2B1710] overflow-hidden">
      <section className="relative hidden lg:flex flex-col items-center justify-center bg-[#EFE8DF] px-12 overflow-hidden">
        <div className="absolute top-12 text-center z-20">
          <h1 className="text-4xl font-black text-[#3A2117]">خذ نظرة على تجربة برندة</h1>
          <p className="mt-3 text-[#7A6255] text-lg font-medium">كل أدوات الكافيه في واجهة واحدة سهلة وأنيقة</p>
        </div>

        <div className="relative mt-32 w-[620px] h-[470px]">
          <div className="absolute -left-8 top-12 w-[520px] h-[360px] rounded-[28px] bg-white/55 shadow-xl rotate-[-6deg]" />
          <div className="absolute -left-3 top-8 w-[540px] h-[380px] rounded-[28px] bg-white/75 shadow-xl rotate-[-3deg]" />

          <div className="absolute inset-0 bg-white rounded-[30px] shadow-2xl p-7">
            <div className="h-full rounded-[22px] bg-[#CBB29C] overflow-hidden relative">
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage: "linear-gradient(#ffffff55 1px, transparent 1px), linear-gradient(90deg, #ffffff55 1px, transparent 1px)",
                  backgroundSize: "34px 34px",
                }}
              />

              <div className="absolute top-8 right-8">
                <div className="w-24 h-12 rounded-2xl border-2 border-[#3A2117]/20 flex items-center justify-center font-black text-[#3A2117]">
                  برندة
                </div>
              </div>

              <div className="absolute top-24 right-14">
                <h2 className="text-5xl font-black leading-tight text-[#3A2117] whitespace-pre-line">{slide.title}</h2>
                <p className="mt-4 text-xl font-bold text-[#5A3A2D]">{slide.desc}</p>
              </div>

              <div className="absolute left-12 top-20 w-56 rounded-3xl bg-white shadow-xl p-4">
                <div className="h-28 rounded-2xl bg-[#E8D4C1] mb-4" />
                <h3 className="font-black text-[#3A2117]">{slide.cardTitle}</h3>
                <p className="text-sm text-[#8A7062] mt-1">{slide.cardDesc}</p>

                <div className="mt-4 flex items-center justify-between">
                  <span className="font-black text-[#6B3A25]">18 ر.س</span>
                  <span className="px-3 py-1 rounded-full bg-[#3A2117] text-[#F8E8D2] text-xs font-bold">{slide.tag}</span>
                </div>
              </div>

              <div className="absolute left-32 bottom-12 w-48 rounded-3xl bg-[#FFF8EF] shadow-xl p-4">
                <p className="text-sm text-[#8A7062]">نقاط الولاء</p>
                <h3 className="text-3xl font-black text-[#3A2117] mt-1">{slide.stat}</h3>
                <div className="mt-3 h-2 rounded-full bg-[#E8D4C1]">
                  <div className="h-2 w-2/3 rounded-full bg-[#6B3A25]" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-3 z-20">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setActive(index)}
              className={active === index ? "w-5 h-5 rounded-full bg-[#3A2117]" : "w-4 h-4 rounded-full bg-[#D9CFC6]"}
            />
          ))}
        </div>

        <button className="mt-8 text-[#3A2117] underline font-bold z-20">
          عرض كل المميزات
        </button>
      </section>

      <section className="relative flex items-center justify-center bg-white px-6 py-10">
        <div className="w-full max-w-[640px]">
          <div className="flex justify-center mb-16">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-3xl border-[5px] border-[#3A2117] flex items-center justify-center">
                <div className="w-8 h-3 rounded-full bg-[#CBB29C]" />
              </div>
              <div>
                <h1 className="text-4xl font-black text-[#3A2117] leading-none">برندة</h1>
                <p className="text-[#7A6255] font-bold mt-1">branda</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 rounded-2xl overflow-hidden border border-[#D8C5B5] mb-8">
            <button className="py-4 bg-[#E9D8C8] text-[#3A2117] font-bold">تسجيل الدخول</button>
            <Link href="/register" className="py-4 bg-white text-[#3A2117] font-bold text-center">
              إنشاء حساب
            </Link>
          </div>

          <form className="space-y-6">
            <input type="email" placeholder="أدخل البريد الإلكتروني" className="w-full h-14 rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none focus:border-[#6B3A25]" />
            <input type="password" placeholder="أدخل كلمة المرور" className="w-full h-14 rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none focus:border-[#6B3A25]" />

            <button type="button" className="w-full h-16 rounded-2xl bg-[#3A2117] text-[#F8E8D2] font-black text-lg shadow-lg">
              متابعة
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}