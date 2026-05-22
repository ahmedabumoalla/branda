"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { setCustomerSession } from "@/lib/customer/session";

export default function CafeCustomerRegisterPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();

  const slug = params.slug;
  const next = searchParams.get("next") || `/c/${slug}`;

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function register() {
    if (!fullName.trim() || !phone.trim()) {
      alert("اكتب الاسم ورقم الجوال");
      return;
    }

    setCustomerSession(slug, {
      id: crypto.randomUUID(),
      cafeSlug: slug,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      createdAt: new Date().toISOString(),
    });

    router.push(next);
  }

  return (
    <main dir="rtl" className="min-h-screen grid lg:grid-cols-2 bg-[#F8F4EF] text-[#2B1710]">
      <section className="hidden lg:flex items-center justify-center bg-[#EFE8DF] p-10">
        <div className="max-w-lg">
          <p className="font-black text-[#8B5E3C]">عميل جديد</p>
          <h1 className="mt-3 text-5xl font-black leading-tight text-[#3A2117]">
            أنشئ حسابك واجمع نقاطك مع كل طلب
          </h1>
          <p className="mt-5 text-lg leading-8 text-[#7A6255]">
            حسابك يربط طلباتك وحجوزاتك ونقاطك داخل كوفي قطرة.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-lg">
          <h1 className="text-4xl font-black text-[#3A2117]">إنشاء حساب عميل</h1>
          <p className="mt-2 text-[#7A6255]">سجّل بياناتك مرة واحدة فقط.</p>

          <div className="mt-8 space-y-4">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="الاسم الكامل"
              className="h-14 w-full rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none"
            />

            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="رقم الجوال"
              className="h-14 w-full rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none"
            />

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الإلكتروني اختياري"
              className="h-14 w-full rounded-2xl border border-[#E5D8CD] px-5 text-right outline-none"
            />

            <button
              onClick={register}
              className="h-14 w-full rounded-2xl bg-[#3A2117] font-black text-[#F8E8D2]"
            >
              إنشاء الحساب والمتابعة
            </button>
          </div>

          <p className="mt-6 text-center text-[#7A6255]">
            عندك حساب؟{" "}
            <Link href={`/c/${slug}/login?next=${encodeURIComponent(next)}`} className="font-black text-[#6B3A25]">
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}