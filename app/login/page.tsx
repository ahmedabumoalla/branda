"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { NeumoInput, PrimaryButton, SoftCard } from "@/components/ui/design-system";
import { loginWithRole } from "@/lib/platform/auth";
import { LOGO } from "@/lib/ui/brand";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    const result = await loginWithRole(email, password);
    setLoading(false);
    if (!result.ok || !result.redirectTo) {
      alert(result.message);
      return;
    }
    if (result.redirectTo === "/cashier") {
      window.location.assign("/cashier");
      return;
    }
    router.push(result.redirectTo);
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    const result = await requestPasswordResetAction(resetEmail);
    setResetMessage(result.message);
  }

  return (
    <main dir="rtl" className="min-h-screen" style={{ background: C.creamBase, color: C.espressoDark }}>
      <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden rounded-[40px] border p-10 shadow-2xl lg:block" style={{ borderColor: C.borderSand, background: `linear-gradient(to bottom right, ${C.coffeeBrown}, ${C.espressoDark})`, color: C.creamBase }}>
          <Image src={LOGO.brownBg} alt="" width={200} height={200} className="pointer-events-none absolute -left-8 -top-8 opacity-25 object-contain" />
          <BarndaksaLogo variant="dark" width={200} height={80} priority className="relative" />
          <h1 className="relative mt-8 text-4xl font-black leading-tight">دخول لوحة التحكم</h1>
          <p className="relative mt-5 max-w-md text-lg font-bold leading-9" style={{ color: C.warmSand }}>سجل دخولك لإدارة حسابك في بارنداكسا</p>
          <Link href="/" className="relative mt-8 inline-block font-black underline" style={{ color: C.softGold }}>العودة للصفحة الرئيسية</Link>
        </div>
        <SoftCard className="w-full p-5 sm:p-8">
          <BarndaksaLogo variant="brown" width={160} height={64} className="mb-6" />
          <h2 className="text-3xl font-black" style={{ color: C.coffeeBrown }}>تسجيل الدخول</h2>
          <p className="mt-2 text-sm font-bold" style={{ color: C.mutedText }}>أدخل بيانات حسابك للمتابعة</p>
          <label className="mt-6 block">
            <span className="text-xs font-black" style={{ color: C.mutedText }}>البريد الإلكتروني</span>
            <div className="relative mt-2">
              <Mail className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6B3A25]" />
              <NeumoInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" className="pr-12" />
            </div>
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-black" style={{ color: C.mutedText }}>كلمة المرور</span>
            <div className="relative mt-2">
              <Lock className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6B3A25]" />
              <NeumoInput value={password} onChange={(e) => setPassword(e.target.value)} type={visible ? "text" : "password"} placeholder="••••••••" className="pr-12 pl-12" />
              <button type="button" onClick={() => setVisible(!visible)} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B3A25]">
                {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>
          <button type="button" onClick={() => setResetOpen(true)} className="mt-4 text-sm font-black text-[#6B3A25]">نسيت كلمة المرور</button>
          <PrimaryButton onClick={handleLogin} disabled={loading} className="mt-6 h-14 w-full">
            {loading ? "جاري الدخول" : "دخول"}
          </PrimaryButton>
        </SoftCard>
      </section>
      {resetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitReset} className="w-full max-w-md rounded-[28px] bg-[#FCF8F3] p-6">
            <button type="button" onClick={() => setResetOpen(false)}><X className="h-5 w-5" /></button>
            <h2 className="mt-4 text-xl font-black">استعادة كلمة المرور</h2>
            <p className="mt-2 text-sm font-bold text-[#806A5E]">أدخل بريدك لإرسال رابط إعادة التعيين</p>
            <NeumoInput type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="البريد الإلكتروني" className="mt-5" />
            {resetMessage ? <p className="mt-3 font-bold text-[#6B3A25]">{resetMessage}</p> : null}
            <PrimaryButton className="mt-5 w-full">إرسال الرابط</PrimaryButton>
          </form>
        </div>
      ) : null}
    </main>
  );
}
