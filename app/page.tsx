import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  Gift,
  LayoutGrid,
  Megaphone,
  Play,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";

const NAV_LINKS = [
  { href: "#features", label: "المزايا" },
  { href: "#solutions", label: "الحلول" },
  { href: "#pricing", label: "الباقات" },
  { href: "/login", label: "تسجيل الدخول" },
] as const;

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "منيو رقمي",
    desc: "منيو تفاعلي يحدّثه فريقك في ثوانٍ ويعرضه العملاء على الجوال.",
  },
  {
    icon: CalendarDays,
    title: "حجوزات سهلة",
    desc: "نظّم الطاولات والأوقات وعدد الضيوف بدون مكالمات متكررة.",
  },
  {
    icon: Gift,
    title: "عروض وخصومات",
    desc: "أطلق عروض موسمية وكوبونات تلقائية تزيد المبيعات.",
  },
  {
    icon: BarChart3,
    title: "تقارير ذكية",
    desc: "تابع المبيعات، أوقات الذروة، وأداء الفروع من لوحة واحدة.",
  },
  {
    icon: Users,
    title: "عملاء",
    desc: "سجّل تفضيلات الزوار وتاريخ زياراتهم لخدمة أذكى.",
  },
  {
    icon: Sparkles,
    title: "نقاط ولاء",
    desc: "كافئ العملاء بنقاط تزيد تكرار الزيارة والولاء.",
  },
  {
    icon: Megaphone,
    title: "تسويق ذكي",
    desc: "حملات SMS وإشعارات تصل للعميل المناسب في الوقت المناسب.",
  },
  {
    icon: ShoppingBag,
    title: "إدارة الطلبات",
    desc: "تابع الطلبات الداخلية والتيك أواي من شاشة موحدة.",
  },
] as const;

const TRUST_PLACEHOLDERS = [
  "BREW LAB",
  "مقهى نُور",
  "MOKA",
  "SIP HOUSE",
  "دلة",
  "ROAST & CO",
] as const;

const COFFEE_HERO =
  "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=900&h=700&fit=crop&q=80";

function CircularProgress({ value, max }: { value: number; max: number }) {
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const offset = circumference * (1 - progress);

  return (
    <div className="relative mx-auto flex h-[220px] w-[220px] items-center justify-center sm:h-[260px] sm:w-[260px]">
      <div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: `${C.goldAccent}22` }}
        aria-hidden
      />
      <svg
        viewBox="0 0 200 200"
        className="relative h-full w-full -rotate-90"
        aria-hidden
      >
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={`${C.goldAccent}33`}
          strokeWidth="12"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={C.goldAccent}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="drop-shadow-[0_0_18px_rgba(217,163,63,0.45)]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <Star className="mb-2 h-7 w-7" style={{ color: C.softGold }} fill={C.softGold} />
        <p className="text-5xl font-black leading-none" style={{ color: C.softGold }}>
          540
        </p>
        <p className="mt-2 text-sm font-bold" style={{ color: `${C.creamBase}cc` }}>
          نقطة مكتسبة
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-hidden"
      style={{ background: C.creamBase, color: C.espressoDark }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-md"
        style={{
          borderColor: C.borderSand,
          background: `${C.creamBase}e6`,
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="shrink-0">
            <BrandaLogo variant="brown" width={140} height={56} priority />
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-bold transition-opacity hover:opacity-70"
                  style={{ color: C.brandBrown }}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-bold transition-opacity hover:opacity-70"
                  style={{ color: C.brandBrown }}
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>

          <Link
            href="/register"
            className="shrink-0 rounded-2xl px-4 py-2.5 text-sm font-black shadow-md transition hover:brightness-110 sm:px-5"
            style={{ background: C.coffeeBrown, color: C.creamBase }}
          >
            ابدأ الآن مجانًا
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span
            className="inline-block rounded-full px-4 py-1.5 text-sm font-bold"
            style={{ background: C.warmSand, color: C.brandBrown }}
          >
            منصة إدارة الكافيهات
          </span>

          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl lg:text-[3.25rem]">
            منيو، حجوزات، ولاء، وتسويق في مكان{" "}
            <span className="relative inline-block" style={{ color: C.goldAccent }}>
              واحد
              <svg
                className="absolute -bottom-1 left-0 w-full"
                viewBox="0 0 120 12"
                fill="none"
                aria-hidden
              >
                <path
                  d="M4 8C28 2 52 10 76 6C92 3 104 4 116 5"
                  stroke={C.goldAccent}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p
            className="mx-auto mt-5 max-w-2xl text-base font-bold leading-8 sm:text-lg"
            style={{ color: C.mutedText }}
          >
            برندة تساعد الكوفيهات على إدارة المنيو، الحجوزات، العروض، العملاء، نقاط
            الولاء، والتقارير من لوحة تحكم واحدة.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex h-14 min-w-[200px] items-center justify-center rounded-2xl px-8 text-base font-black shadow-lg transition hover:brightness-110"
              style={{ background: C.coffeeBrown, color: C.creamBase }}
            >
              ابدأ الآن مجانًا
            </Link>
            <button
              type="button"
              className="inline-flex h-14 min-w-[200px] items-center justify-center gap-2 rounded-2xl border px-8 text-base font-black transition hover:bg-white/60"
              style={{ borderColor: C.borderSand, color: C.espressoDark }}
            >
              <Play className="h-4 w-4 fill-current" />
              شاهد كيف يعمل
            </button>
          </div>
        </div>

        <div
          className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-[2rem] border p-4 sm:p-6"
          style={{ background: C.warmSand, borderColor: C.borderSand }}
        >
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="overflow-hidden rounded-[1.5rem]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={COFFEE_HERO}
                alt="فنجان قهوة latte على طاولة خشبية"
                className="h-full min-h-[220px] w-full object-cover sm:min-h-[280px]"
              />
            </div>

            <div
              className="flex flex-col justify-center rounded-[1.5rem] border bg-white/70 p-6 sm:p-8"
              style={{ borderColor: C.borderSand }}
            >
              <p className="text-sm font-bold" style={{ color: C.mutedText }}>
                إحصاء
              </p>
              <p
                className="mt-1 text-5xl font-black leading-none sm:text-6xl"
                style={{ color: C.goldAccent }}
              >
                540
              </p>
              <p className="mt-2 text-lg font-black">نقاط ولاء تم جمعها</p>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex -space-x-2 space-x-reverse">
                  {[C.brandBrown, C.coffeeBrown, C.goldAccent, C.mutedText].map(
                    (color, i) => (
                      <div
                        key={i}
                        className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-black text-white"
                        style={{ background: color, borderColor: C.creamBase }}
                      >
                        {i + 1}
                      </div>
                    ),
                  )}
                </div>
                <span
                  className="rounded-full px-3 py-1 text-sm font-black"
                  style={{ background: `${C.goldAccent}22`, color: C.brandBrown }}
                >
                  +12k
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center text-3xl font-black sm:text-4xl">
          كل ما تحتاجه لإدارة كوفي شوبك
        </h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            const isWide = index === 0 || index === 7;

            return (
              <article
                key={feature.title}
                className={`rounded-3xl border p-6 transition hover:-translate-y-0.5 hover:shadow-md ${
                  isWide ? "lg:col-span-2" : ""
                }`}
                style={{
                  background: "white",
                  borderColor: C.borderSand,
                  boxShadow: "6px 8px 24px rgba(49, 25, 18, 0.05)",
                }}
              >
                <div
                  className="mb-4 inline-flex rounded-2xl p-3"
                  style={{ background: C.warmSand }}
                >
                  <Icon className="h-6 w-6" style={{ color: C.brandBrown }} />
                </div>
                <h3 className="text-lg font-black">{feature.title}</h3>
                <p
                  className="mt-2 text-sm font-bold leading-7"
                  style={{ color: C.mutedText }}
                >
                  {feature.desc}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Dark loyalty */}
      <section
        id="solutions"
        className="mx-4 overflow-hidden rounded-[2rem] sm:mx-6 lg:mx-auto lg:max-w-6xl"
        style={{ background: C.espressoDark }}
      >
        <div className="grid items-center gap-10 px-6 py-14 sm:px-10 sm:py-16 lg:grid-cols-2 lg:gap-12">
          <div>
            <p className="text-sm font-bold" style={{ color: `${C.softGold}aa` }}>
              إحصاء
            </p>
            <h2 className="mt-2 text-3xl font-black leading-tight sm:text-4xl" style={{ color: C.creamBase }}>
              نقاط ولاء تزيد العودة
            </h2>
            <p className="mt-4 max-w-md text-base font-bold leading-8" style={{ color: `${C.creamBase}bb` }}>
              كل نقطة تقرب عميلك أكثر — برنامج ولاء مرن يكافئ الزيارات المتكررة
              ويحوّل الزائر إلى عميل دائم.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl px-6 text-sm font-black transition hover:brightness-110"
              style={{ background: C.goldAccent, color: C.espressoDark }}
            >
              تعرف على برنامج الولاء
            </Link>
          </div>

          <CircularProgress value={540} max={700} />
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center text-2xl font-black sm:text-3xl">
          موثوق من كوفيهات حول المملكة
        </h2>
        <p
          className="mx-auto mt-3 max-w-xl text-center text-sm font-bold"
          style={{ color: C.mutedText }}
        >
          أسماء تجريبية للعرض — لا تمثل عملاء فعليين
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {TRUST_PLACEHOLDERS.map((name) => (
            <div
              key={name}
              className="rounded-2xl border px-5 py-3 text-sm font-black tracking-wide opacity-70 grayscale"
              style={{
                borderColor: C.borderSand,
                background: C.warmSand,
                color: C.brandBrown,
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* Pricing anchor placeholder */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <p className="text-center text-sm font-bold" style={{ color: C.mutedText }}>
          باقات مرنة تناسب الكوفيهات الصغيرة والسلاسل الكبيرة — تواصل معنا للتفاصيل.
        </p>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div
          className="grid items-center gap-8 overflow-hidden rounded-[2rem] border p-6 sm:p-10 lg:grid-cols-2"
          style={{ background: C.warmSand, borderColor: C.borderSand }}
        >
          <div className="flex justify-center lg:justify-start">
            <div
              className="relative flex h-56 w-44 flex-col items-center justify-end rounded-b-[2rem] rounded-t-[1rem] border shadow-lg sm:h-64 sm:w-52"
              style={{
                background: `linear-gradient(180deg, ${C.creamBase} 0%, ${C.warmSand} 100%)`,
                borderColor: C.borderSand,
              }}
            >
              <div
                className="absolute -top-3 h-6 w-24 rounded-sm"
                style={{ background: C.borderSand }}
              />
              <div className="mb-8 px-4 text-center">
                <BrandaLogo variant="brown" width={100} height={40} />
                <p className="mt-2 text-xs font-bold" style={{ color: C.mutedText }}>
                  كوب برنده
                </p>
              </div>
            </div>
          </div>

          <div className="text-center lg:text-right">
            <h2 className="text-3xl font-black sm:text-4xl">جاهز تطور كوفي شوبك؟</h2>
            <p className="mt-4 text-base font-bold leading-8" style={{ color: C.mutedText }}>
              انضم الآن وابدأ رحلتك مع برندة — من المنيو إلى الولاء في منصة واحدة.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/register"
                className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl px-8 text-base font-black shadow-lg transition hover:brightness-110"
                style={{ background: C.coffeeBrown, color: C.creamBase }}
              >
                ابدأ الآن مجانًا
              </Link>
              <Link
                href="/login"
                className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl border px-8 text-base font-black transition hover:bg-white/50"
                style={{ borderColor: C.borderSand, color: C.espressoDark }}
              >
                تواصل معنا
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center text-sm font-bold"
        style={{ borderColor: C.borderSand, color: C.mutedText }}
      >
        <p>© 2024 برندة. جميع الحقوق محفوظة.</p>
      </footer>
    </main>
  );
}
