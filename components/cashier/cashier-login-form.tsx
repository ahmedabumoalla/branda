"use client";

import Link from "next/link";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { loginCashierAction } from "@/app/actions/cashier";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";

export function CashierLoginForm({ initialMessage = "" }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await loginCashierAction(email, password);
      if (result && !result.ok) setMessage(result.message);
    } catch {
      setMessage("تعذر بدء جلسة نقطة التشغيل. حاول مجددًا");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-[#F8F4EF] px-4 py-8 text-[#311912]">
      <section className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-xl">
        <div className="bg-[#311912] px-6 py-7 text-white sm:px-8">
          <BarndaksaLogo variant="dark" width={150} height={58} priority />
          <div className="mt-5 flex items-center gap-2 text-xs font-black text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            دخول مخصص لموظفي الفرع
          </div>
        </div>
        <form onSubmit={submit} className="p-6 sm:p-8">
          <h1 className="text-2xl font-black">دخول نقطة التشغيل</h1>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
            أدخل بيانات موظف الكاشير لبدء معالجة الطلبات والولاء والمكافآت.
          </p>
          <label className="mt-6 block text-sm font-black">
            البريد الإلكتروني
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#E8DED5] bg-[#FCFAF7] px-4 outline-none focus:border-[#6B3A25]"
              placeholder="cashier@example.com"
            />
          </label>
          <label className="mt-4 block text-sm font-black">
            كلمة المرور
            <span className="relative mt-2 block">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-12 w-full rounded-2xl border border-[#E8DED5] bg-[#FCFAF7] px-4 pl-12 outline-none focus:border-[#6B3A25]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#6B3A25]"
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </span>
          </label>
          {message ? (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-black text-red-700">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 font-black text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            {loading ? "جارٍ التحقق..." : "دخول"}
          </button>
          <Link href="/login" className="mt-5 block text-center text-sm font-black text-[#6B3A25] underline underline-offset-4">
            العودة إلى تسجيل الدخول العام
          </Link>
        </form>
      </section>
    </main>
  );
}
