import Link from "next/link";
import Image from "next/image";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { LOGO } from "@/lib/ui/brand";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";

export default function RegisterPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen grid lg:grid-cols-2"
      style={{ background: C.creamBase, color: C.espressoDark }}
    >
      <section
        className="relative hidden flex-col items-center justify-center overflow-hidden px-12 lg:flex"
        style={{
          background: `linear-gradient(to bottom right, ${C.warmSand}, ${C.creamBase})`,
        }}
      >
        <Image
          src={LOGO.brownBg}
          alt=""
          width={280}
          height={280}
          className="pointer-events-none absolute opacity-15 object-contain"
        />
        <BrandaLogo variant="brown" width={220} height={88} priority className="relative" />
        <h1
          className="relative mt-10 text-center text-4xl font-black leading-tight"
          style={{ color: C.coffeeBrown }}
        >
          ابدأ كوفيك الرقمي مع برندة
        </h1>
        <p className="relative mt-4 text-center text-lg font-bold" style={{ color: C.mutedText }}>
          منيو، حجوزات، عروض، ونقاط ولاء في لوحة واحدة.
        </p>
      </section>

      <section className="flex min-w-0 items-center justify-center bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full min-w-0 max-w-[620px]">
          <div className="mb-10 flex flex-col items-center text-center">
            <BrandaLogo variant="brown" width={180} height={72} />
            <h1 className="mt-6 text-3xl font-black sm:text-4xl" style={{ color: C.coffeeBrown }}>
              إنشاء حساب
            </h1>
            <p className="mt-2 font-bold" style={{ color: C.mutedText }}>
              أنشئ حساب الكوفي وابدأ التحكم
            </p>
          </div>

          <div
            className="mb-8 grid grid-cols-2 overflow-hidden rounded-2xl border shadow-[4px_6px_16px_rgba(49,25,18,0.06)]"
            style={{ borderColor: C.borderSand }}
          >
            <Link
              href="/login"
              className="bg-white py-4 text-center font-black transition hover:opacity-90"
              style={{ color: C.mutedText }}
            >
              تسجيل الدخول
            </Link>
            <span
              className="py-4 text-center font-black"
              style={{ background: C.coffeeBrown, color: C.creamBase }}
            >
              إنشاء حساب
            </span>
          </div>

          <form className="space-y-4">
            {[
              "اسم صاحب الكوفي",
              "اسم الكوفي",
              "البريد الإلكتروني",
              "رقم الجوال",
              "كلمة المرور",
            ].map((placeholder, i) => (
              <input
                key={placeholder}
                type={i === 2 ? "email" : i === 4 ? "password" : "text"}
                placeholder={placeholder}
                className="branda-neumo-inset h-14 w-full rounded-2xl border px-5 text-right font-bold outline-none focus:border-[#6B3A25]/40"
                style={{
                  borderColor: C.borderSand,
                  background: C.creamBase,
                }}
              />
            ))}

            <Link
              href="/dashboard"
              className="flex h-16 w-full items-center justify-center rounded-2xl text-lg font-black shadow-[6px_8px_24px_rgba(49,25,18,0.25)]"
              style={{ background: C.coffeeBrown, color: C.creamBase }}
            >
              تسجيل
            </Link>
          </form>
        </div>
      </section>
    </main>
  );
}
