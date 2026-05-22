"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { setCustomerSession } from "@/lib/customer/session";

export default function CafeCustomerLoginPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();

  const slug = params.slug;
  const next = searchParams.get("next") || `/c/${slug}`;

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");

  function login() {
    if (!phone.trim()) {
      alert("اكتب رقم الجوال");
      return;
    }

    setCustomerSession(slug, {
      id: `customer_${phone.trim()}`,
      cafeSlug: slug,
      fullName: name.trim() || "عميل برندة",
      phone: phone.trim(),
      createdAt: new Date().toISOString(),
    });

    router.push(next);
  }

  return (
    <main dir="rtl" className="min-h-screen grid lg:grid-cols-2 bg-[#F8F4EF] text-[#2B1710]">
      <section className="hidden lg:flex items-center justify-center bg-[#EFE8DF] p-10">
        <div className="max-w-lg">
          <p className="font-black text-[#8B5E3C]">كوفي قطرة</p>
          <h1 className="mt-3 text-5xl font-black leading-tight text-[#3A2117]">
            سجّل دخولك لإكمال الطلب أو الحجز
          </h1>
          <p className="mt-5 text-lg leading-8 text-[#7A6255]">
            حساب العميل يساعد الكوفي يعرف طلباتك، حجوزاتك، ونقاط الولاء الخاصة بك بدون لخبطة.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-lg">
          <h1 className="text-4xl font-black text-[#3A2117]">تسجيل دخول العميل</h1>
          <p className="mt-2 text-[#7A6255]">ادخل رقم جوالك للمتابعة داخل الكوفي.</p>

          <div className="mt-8 space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم اختياري"
              className="h-14 w-full rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none"
            />

            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="رقم الجوال"
              className="h-14 w-full rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none"
            />

            <button
              onClick={login}
              className="h-14 w-full rounded-2xl bg-[#3A2117] font-black text-[#F8E8D2]"
            >
              دخول ومتابعة
            </button>
          </div>

          <p className="mt-6 text-center text-[#7A6255]">
            ما عندك حساب؟{" "}
            <Link href={`/c/${slug}/register?next=${encodeURIComponent(next)}`} className="font-black text-[#6B3A25]">
              إنشاء حساب جديد
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}