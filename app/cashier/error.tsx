"use client";
import Link from "next/link";
import { CashierLanguageSwitch, useCashierLanguage } from "@/components/cashier/cashier-language";
export default function CashierError({ reset }: { reset: () => void }) {
  const { t, dir, locale } = useCashierLanguage();
  return <main dir={dir} lang={locale} className="grid min-h-dvh place-items-center bg-[#F8F4EF] px-4 text-[#311912]"><section className="w-full max-w-md space-y-5 rounded-3xl border border-[#E8DED5] bg-white p-7"><CashierLanguageSwitch /><h1 className="text-xl font-bold">{t("تعذر تحميل نقطة التشغيل")}</h1><p className="text-sm leading-7">{t("تحقق من الاتصال وصلاحية دخولك ثم حاول مجددًا")}</p><div className="flex flex-wrap gap-4"><button onClick={reset} className="min-h-12 rounded-xl bg-[#6B3A25] px-5 font-bold text-white">{t("إعادة المحاولة")}</button><Link className="inline-flex min-h-12 items-center underline" href="/cashier/login">{t("تسجيل الدخول")}</Link></div></section></main>;
}
