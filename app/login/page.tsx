"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { NeumoInput, PrimaryButton, SoftCard } from "@/components/ui/design-system";
import { loginWithRole } from "@/lib/platform/auth";
import { LOGO } from "@/lib/ui/brand";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@qatrah.com");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);

  function handleLogin() {
    setLoading(true);
    const result = loginWithRole(email, password);

    if (!result.ok || !result.redirectTo) {
      setLoading(false);
      alert(result.message);
      return;
    }

    router.push(result.redirectTo);
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] text-[#2B1710]">
      <section className="mx-auto grid min-h-screen max-w-6xl min-w-0 items-center gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-10 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden rounded-[32px] border border-[#E5D8CD] bg-gradient-to-br from-[#3A2117] to-[#241610] p-8 text-[#F8F4EF] shadow-2xl sm:rounded-[40px] sm:p-10 lg:block">
          <Image
            src={LOGO.brownBg}
            alt=""
            width={200}
            height={200}
            className="pointer-events-none absolute -left-8 -top-8 opacity-25 object-contain"
          />
          <BrandaLogo variant="dark" width={200} height={80} priority className="relative" />
          <h1 className="relative mt-8 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
            دخول لوحة التحكم
          </h1>
          <p className="relative mt-5 max-w-md text-lg font-bold leading-9 text-[#CBB29C]">
            سجّل دخولك لإدارة حسابك في برندة. يتم توجيهك تلقائيًا حسب نوع الحساب (كوفي /
            أدمن).
          </p>
          <Link href="/" className="relative mt-8 inline-block font-black text-[#F6C35B] underline">
            العودة للصفحة الرئيسية
          </Link>
        </div>

        <SoftCard className="w-full min-w-0 p-5 sm:p-8">
          <BrandaLogo variant="brown" width={160} height={64} className="mb-6" />
          <h2 className="text-2xl font-black text-[#3A2117] sm:text-3xl">تسجيل الدخول</h2>
          <p className="mt-2 text-sm font-bold text-[#7A6255]">أدخل بيانات حسابك للمتابعة.</p>

          <label className="mt-6 block">
            <span className="text-xs font-black text-[#7A6255]">البريد الإلكتروني</span>
            <div className="relative mt-2">
              <Mail className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B5E3C]" />
              <NeumoInput
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="pr-12"
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-black text-[#7A6255]">كلمة المرور</span>
            <div className="relative mt-2">
              <Lock className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8B5E3C]" />
              <NeumoInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                className="pr-12"
              />
            </div>
          </label>

          <PrimaryButton
            onClick={handleLogin}
            disabled={loading}
            className="mt-6 h-14 w-full"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </PrimaryButton>

          <div className="mt-5 rounded-2xl bg-[#F8F4EF] p-4 text-sm font-bold leading-7 text-[#7A6255]">
            للتجربة:
            <br />
            كوفي: owner@qatrah.com / 123456
            <br />
            أدمن: admin@branda.com / admin123
          </div>
        </SoftCard>
      </section>
    </main>
  );
}
