"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { loginCashierAction } from "@/app/actions/cashier";

export default function CashierLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const result = await loginCashierAction(email, password);
    setLoading(false);
    setMessage(result.message);
    if (result.ok) router.push(result.redirectTo);
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#F8F4EF] px-4">
      <section className="w-full max-w-md rounded-[32px] bg-white p-8 shadow-xl">
        <p className="font-black text-[#6B3A25]">بارنداكسا كاشير</p>
        <h1 className="mt-2 text-3xl font-black text-[#311912]">تسجيل دخول الكاشير</h1>
        <div className="mt-6 space-y-4">
          <input className="w-full rounded-2xl bg-[#F8F4EF] px-4 py-4 font-bold text-[#311912]" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="relative">
            <input className="w-full rounded-2xl bg-[#F8F4EF] px-4 py-4 pl-12 font-bold text-[#311912]" placeholder="كلمة المرور المؤقتة" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B3A25]">
              {show ? <EyeOff /> : <Eye />}
            </button>
          </div>
          <button onClick={submit} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-4 font-black text-white disabled:opacity-60">
            <LogIn className="h-5 w-5" />
            {loading ? "جاري الدخول" : "دخول"}
          </button>
          {message ? <p className="text-center text-sm font-black text-[#6B3A25]">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}
