"use client";

import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { loginUnifiedAction, requestPasswordResetAction } from "@/app/actions/auth";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { NeumoInput, PrimaryButton, SoftCard } from "@/components/ui/design-system";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setLoginMessage("");
    try {
      const result = await loginUnifiedAction(email, password);
      if (!result.ok) setLoginMessage(result.message);
    } catch {
      setLoginMessage("تعذر تسجيل الدخول. حاول مجددًا");
    } finally {
      setLoading(false);
    }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    setResetLoading(true);
    setResetMessage("");
    const result = await requestPasswordResetAction(resetEmail);
    setResetLoading(false);
    setResetMessage(result.message);
  }

  return (
    <main dir="rtl" className="min-h-screen" style={{ background: C.creamBase, color: C.espressoDark }}>
      <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden rounded-[40px] border p-10 shadow-2xl lg:block" style={{ borderColor: C.borderSand, background: `linear-gradient(to bottom right, ${C.coffeeBrown}, ${C.espressoDark})`, color: C.creamBase }}>
          <BarndaksaLogo variant="dark" width={200} height={80} priority className="relative" />
          <h1 className="relative mt-8 text-4xl font-black leading-tight">دخول لوحة التحكم</h1>
          <p className="relative mt-5 max-w-md text-lg font-bold leading-9" style={{ color: C.warmSand }}>سجل دخولك لإدارة حسابك في برندة</p>
          <Link href="/" className="relative mt-8 inline-block font-black underline" style={{ color: C.softGold }}>العودة للصفحة الرئيسية</Link>
        </div>
        <SoftCard className="w-full p-5 sm:p-8">
          <form onSubmit={handleLogin}>
          <BarndaksaLogo variant="brown" width={160} height={64} className="mb-6" />
          <h2 className="text-3xl font-black" style={{ color: C.coffeeBrown }}>تسجيل الدخول</h2>
          <p className="mt-2 text-sm font-bold" style={{ color: C.mutedText }}>أدخل بيانات حسابك للمتابعة</p>
          <label className="mt-6 block">
            <span className="text-xs font-black" style={{ color: C.mutedText }}>البريد الإلكتروني</span>
            <div className="relative mt-2">
              <Mail className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6B3A25]" />
              <NeumoInput type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" className="pr-12" />
            </div>
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-black" style={{ color: C.mutedText }}>كلمة المرور</span>
            <div className="relative mt-2">
              <Lock className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6B3A25]" />
              <NeumoInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} type={visible ? "text" : "password"} placeholder="••••••••" className="pr-12 pl-12" />
              <button type="button" onClick={() => setVisible(!visible)} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B3A25]">
                {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>
          <button
            type="button"
            onClick={() => {
              setResetEmail(email);
              setResetMessage("");
              setResetOpen(true);
            }}
            className="mt-4 text-sm font-black text-[#6B3A25]"
          >
            نسيت كلمة المرور؟
          </button>
          <PrimaryButton type="submit" disabled={loading} className="mt-6 h-14 w-full">
            {loading ? "جاري الدخول" : "دخول"}
          </PrimaryButton>
          {loginMessage ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-black text-red-700">{loginMessage}</p> : null}
          </form>
        </SoftCard>
      </section>
      {resetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitReset} className="w-full max-w-md rounded-[28px] bg-[#FCF8F3] p-6">
            <button type="button" onClick={() => setResetOpen(false)}><X className="h-5 w-5" /></button>
            <h2 className="mt-4 text-xl font-black">استعادة كلمة المرور</h2>
            <p className="mt-2 text-sm font-bold text-[#806A5E]">أدخل بريدك لإرسال رابط استعادة كلمة المرور</p>
            <NeumoInput type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="البريد الإلكتروني" className="mt-5" />
            {resetMessage ? <p className="mt-3 font-bold text-[#6B3A25]">{resetMessage}</p> : null}
            <PrimaryButton disabled={resetLoading} className="mt-5 w-full">
              {resetLoading ? "جار إرسال الرابط..." : "إرسال الرابط"}
            </PrimaryButton>
          </form>
        </div>
      ) : null}
    </main>
  );
}
