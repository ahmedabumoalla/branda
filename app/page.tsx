"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Gift,
  LayoutGrid,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { LOGO } from "@/lib/ui/brand";

const slides = [
  {
    title: "منيو رقمي وتجربة أذكى",
    desc: "للحجوزات، الطلبات، ونقاط الولاء",
    stat: "1,240",
    tag: "الأكثر طلبًا",
  },
  {
    title: "حجوزات الطاولات بسهولة",
    desc: "نظّم الطاولات والأوقات وعدد الضيوف",
    stat: "86",
    tag: "حجز اليوم",
  },
  {
    title: "نقاط ولاء تزيد العودة",
    desc: "كافئ العملاء وخلّيهم يرجعون أكثر",
    stat: "540",
    tag: "نقطة مكتسبة",
  },
];

export default function HomePage() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((c) => (c + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const slide = slides[active];

  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-hidden bg-[#F8F4EF] text-[#2B1710]"
    >
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-2">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#EFE2D3] via-[#F8F4EF] to-[#E5D8CD] px-10 py-12 lg:flex">
          <div className="relative z-10 text-center">
            <BrandaLogo variant="brown" width={220} height={88} priority className="mx-auto" />
            <h1 className="mt-8 text-3xl font-black text-[#3A2117]">
              خذ نظرة على تجربة برندة
            </h1>
            <p className="mt-3 text-lg font-bold text-[#7A6255]">
              كل أدوات الكافيه في واجهة واحدة — Bento • Soft UI
            </p>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[560px]">
            <div className="overflow-hidden rounded-[36px] border border-[#E5D8CD] bg-white p-6 shadow-[12px_16px_48px_rgba(58,33,23,0.12)]">
              <div className="relative rounded-[28px] bg-[#3A2117] p-8 text-[#F8F4EF]">
                <Image
                  src={LOGO.brownBg}
                  alt=""
                  width={120}
                  height={120}
                  className="absolute left-6 top-6 opacity-20 object-contain"
                />
                <h2 className="relative text-4xl font-black leading-tight">{slide.title}</h2>
                <p className="relative mt-4 text-lg font-bold text-[#CBB29C]">{slide.desc}</p>
                <div className="relative mt-8 flex items-end justify-between">
                  <div>
                    <p className="text-sm text-[#CBB29C]">إحصاء</p>
                    <p className="text-4xl font-black text-[#F6C35B]">{slide.stat}</p>
                  </div>
                  <span className="rounded-full bg-[#F6C35B]/20 px-4 py-2 text-sm font-black text-[#F6C35B]">
                    {slide.tag}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`h-2.5 rounded-full transition ${
                    active === i ? "w-8 bg-[#3A2117]" : "w-2.5 bg-[#D9CFC6]"
                  }`}
                  aria-label={`شريحة ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <Link
            href="/login"
            className="relative z-10 mx-auto font-black text-[#6B3A25] underline"
          >
            دخول لوحة التحكم
          </Link>
        </section>

        <section className="flex flex-col justify-center px-6 py-12 lg:px-14">
          <div className="mb-10 flex justify-center lg:justify-start">
            <BrandaLogo variant="brown" width={200} height={80} priority />
          </div>

          <p className="font-black text-[#6B3A25]">منصة إدارة الكوفيهات</p>
          <h2 className="mt-4 text-4xl font-black leading-tight text-[#3A2117] sm:text-5xl">
            منيو، حجوزات، ولاء، وتسويق في مكان واحد
          </h2>
          <p className="mt-5 max-w-xl text-lg font-bold leading-9 text-[#7A6255]">
            برندة تساعد الكوفيهات على إدارة المنيو، الحجوزات، العروض، العملاء، نقاط
            الولاء، والتقارير من لوحة تحكم واحدة.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              [LayoutGrid, "Bento Grid"],
              [Gift, "عروض"],
              [CalendarDays, "حجوزات"],
              [Star, "ولاء"],
              [Users, "عملاء"],
              [Sparkles, "تسويق"],
            ].map(([Icon, label]) => {
              const I = Icon as React.ElementType;
              return (
                <div
                  key={label as string}
                  className="rounded-2xl border border-[#E5D8CD] bg-white p-4 text-center shadow-[6px_8px_20px_rgba(58,33,23,0.05)]"
                >
                  <I className="mx-auto h-6 w-6 text-[#6B3A25]" />
                  <p className="mt-2 text-sm font-black text-[#3A2117]">{label as string}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Link
              href="/login"
              className="flex h-16 items-center justify-center rounded-2xl bg-[#3A2117] text-lg font-black text-[#F8E8D2] shadow-[6px_8px_24px_rgba(58,33,23,0.25)]"
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/register"
              className="flex h-16 items-center justify-center rounded-2xl border border-[#E5D8CD] bg-white text-lg font-black text-[#3A2117] shadow-[4px_6px_16px_rgba(58,33,23,0.06)]"
            >
              إنشاء حساب
            </Link>
          </div>

          <div className="mt-8 rounded-3xl border border-[#E5D8CD] bg-[#EFE2D3]/50 p-5 text-center">
            <p className="font-bold text-[#7A6255]">
              جميع المستخدمين يدخلون من نفس صفحة الدخول، والتوجيه تلقائي حسب نوع الحساب.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
