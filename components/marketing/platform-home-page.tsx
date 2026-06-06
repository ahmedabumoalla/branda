"use client";

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
  Store,
  Users,
  X,
  Mail,
  Phone,
  Camera,
  Globe,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  recordIntroVideoEventAction,
  submitContactRequestAction,
} from "@/app/actions/platform-content";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";
import type { PublicPlatformHomeData } from "@/lib/data/platform-content";

const DEFAULT_HERO =
  "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=1200&h=900&fit=crop&q=80";

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "منيو تفاعلي",
    desc: "منيو رقمي يعرض منتجات علامتك ويحدثه فريقك بسهولة",
  },
  {
    icon: CalendarDays,
    title: "حجوزات سهلة",
    desc: "نظم الحجوزات والمناسبات وطلبات العملاء من مكان واحد",
  },
  {
    icon: Gift,
    title: "عروض وخصومات",
    desc: "أطلق عروضك الخاصة واربطها برحلة العميل داخل علامتك",
  },
  {
    icon: BarChart3,
    title: "تقارير فورية",
    desc: "تابع أداء العمليات والطلبات والعملاء بوضوح",
  },
  {
    icon: Users,
    title: "متابعة العملاء",
    desc: "اعرف عملاءك وقدم لهم تجربة أكثر ارتباطا بعلامتك",
  },
  {
    icon: Sparkles,
    title: "بطاقات ولاء",
    desc: "كافئ العملاء بنقاط تزيد تكرار المبيعات والولاء",
  },
  {
    icon: Megaphone,
    title: "تسويق ذكي",
    desc: "حول عملاءك لمسوقين لعلامتك التجارية بمشاركة تجاربهم وكافئهم ببطاقات ولاء",
  },
  {
    icon: ShoppingBag,
    title: "إدارة الطلبات",
    desc: "تابع طلباتك وتحكم في مبيعاتك من شاشة موحدة",
  },
] as const;

function AdaptiveMessage({ text }: { text: string }) {
  const length = text.trim().length;
  const size =
    length < 40
      ? "text-3xl sm:text-4xl"
      : length < 95
        ? "text-2xl sm:text-3xl"
        : "text-xl sm:text-2xl";
  return (
    <p className={`${size} font-black leading-relaxed`} style={{ color: C.coffeeBrown }}>
      {text || "ضع عبارتك الخاصة من لوحة إدارة محتوى المنصة"}
    </p>
  );
}

function LoyaltyCards({ images }: { images: PublicPlatformHomeData["loyaltyImages"] }) {
  if (images.length) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {images.slice(0, 4).map((item) => (
          <img
            key={item.id}
            src={item.url}
            alt={item.altText || "بطاقة ولاء برندة"}
            className="h-44 w-full rounded-3xl object-cover"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[320px] items-center justify-center">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="absolute flex h-44 w-72 flex-col justify-between rounded-[26px] border p-5 shadow-2xl sm:w-80"
          style={{
            background: index === 1 ? C.brandBrown : index === 2 ? C.goldAccent : C.creamBase,
            borderColor: C.borderSand,
            color: index === 0 ? C.espressoDark : C.creamBase,
            transform: `translate(${(index - 1) * 42}px, ${(index - 1) * -20}px) rotate(${(index - 1) * 5}deg)`,
            zIndex: index === 1 ? 3 : index === 2 ? 2 : 1,
          }}
        >
          <BrandaLogo variant={index === 0 ? "brown" : "dark"} width={92} height={36} />
          <div>
            <p className="text-xs font-black opacity-80">بطاقة ولاء رقمية</p>
            <div className="mt-3 flex gap-[3px]">
              {[3, 1, 4, 2, 5, 1, 3, 4, 2, 1, 5, 3, 2].map((height, bar) => (
                <span
                  key={bar}
                  className="w-1 rounded-full bg-current"
                  style={{ height: `${height * 6}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactModal({
  open,
  onClose,
  contacts,
}: {
  open: boolean;
  onClose: () => void;
  contacts: PublicPlatformHomeData["contacts"];
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    await submitContactRequestAction({ fullName, email, message });
    setState("done");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[28px] bg-[#FCF8F3] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="mb-4 rounded-full p-2">
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-black">تواصل معنا</h2>
        {state === "done" ? (
          <p className="mt-6 rounded-2xl bg-[#EFE2D3] p-4 font-black">
            وصلتنا رسالتك وسنتواصل معك قريبا
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم" className="h-14 w-full rounded-2xl border border-[#E7D7C6] bg-white px-4 font-bold outline-none" />
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" className="h-14 w-full rounded-2xl border border-[#E7D7C6] bg-white px-4 font-bold outline-none" />
            <textarea required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="اكتب رسالتك" className="min-h-32 w-full rounded-2xl border border-[#E7D7C6] bg-white p-4 font-bold outline-none" />
            <button disabled={state === "saving"} className="h-14 w-full rounded-2xl bg-[#4A281D] font-black text-white">
              {state === "saving" ? "جاري الإرسال" : "إرسال"}
            </button>
          </form>
        )}
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-bold text-[#806A5E]">
          {contacts.email ? <span className="inline-flex items-center gap-1"><Mail className="h-4 w-4" />{contacts.email}</span> : null}
          {contacts.whatsapp ? <span className="inline-flex items-center gap-1"><Phone className="h-4 w-4" />{contacts.whatsapp}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function PlatformHomePage({ data }: { data: PublicPlatformHomeData }) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [brandIndex, setBrandIndex] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const heroImages = data.heroImages.length ? data.heroImages : null;

  useEffect(() => {
    if (!heroImages || heroImages.length < 2) return;
    const interval = window.setInterval(
      () => setHeroIndex((current) => (current + 1) % heroImages.length),
      data.settings.carouselIntervalSeconds * 1000
    );
    return () => window.clearInterval(interval);
  }, [heroImages, data.settings.carouselIntervalSeconds]);

  useEffect(() => {
    if (data.brands.length < 5) return;
    const interval = window.setInterval(
      () => setBrandIndex((current) => (current + 1) % data.brands.length),
      4500
    );
    return () => window.clearInterval(interval);
  }, [data.brands.length]);

  async function openVideo() {
    setVideoOpen(true);
    await recordIntroVideoEventAction("intro_video_click");
  }

  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden" style={{ background: C.creamBase, color: C.espressoDark }}>
      <header className="sticky top-0 z-50 border-b backdrop-blur-md" style={{ borderColor: C.borderSand, background: `${C.creamBase}ed` }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/"><BrandaLogo variant="brown" width={140} height={56} priority /></Link>
          <nav className="hidden items-center gap-6 md:flex">
            {[["#features", "المزايا"], ["#solutions", "الحلول"], ["#about", "من نحن"], ["/careers", "الوظائف"], ["/login", "تسجيل الدخول"]].map(([href, label]) =>
              href.startsWith("/") ? <Link key={href} href={href} className="text-sm font-bold">{label}</Link> : <a key={href} href={href} className="text-sm font-bold">{label}</a>
            )}
          </nav>
          <Link href="/register" className="rounded-2xl bg-[#4A281D] px-5 py-3 text-sm font-black text-white">ابدأ الآن مجانًا</Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-block rounded-full bg-[#EFE2D3] px-5 py-2 text-sm font-black text-[#6B3A25]">
            {data.settings.heroBadge}
          </span>
          <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">{data.settings.heroTitle}</h1>
          <p className="mx-auto mt-5 max-w-3xl text-base font-bold leading-9 text-[#806A5E] sm:text-lg">
            {data.settings.heroDescription}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="inline-flex h-14 min-w-[200px] items-center justify-center rounded-2xl bg-[#4A281D] px-8 font-black text-white">ابدأ الآن مجانًا</Link>
            <button type="button" onClick={openVideo} className="inline-flex h-14 min-w-[200px] items-center justify-center gap-2 rounded-2xl border border-[#E7D7C6] px-8 font-black">
              <Play className="h-4 w-4 fill-current" />
              شاهد كيف يعمل
            </button>
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-[2rem] border border-[#E7D7C6] bg-[#EFE2D3] p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <div className="relative min-h-[260px] overflow-hidden rounded-[1.5rem] sm:min-h-[330px]">
              {heroImages ? heroImages.map((item, index) => (
                <img key={item.id} src={item.url} alt={item.altText || "واجهة برندة"} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === heroIndex ? "opacity-100" : "opacity-0"}`} />
              )) : (
                <img src={DEFAULT_HERO} alt="واجهة برندة الأساسية" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
            <div className="flex items-center rounded-[1.5rem] border border-[#E7D7C6] bg-white/70 p-7 sm:p-9">
              <AdaptiveMessage text={data.settings.heroSideText} />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center text-3xl font-black sm:text-4xl">{data.settings.featuresTitle}</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className={`rounded-3xl border border-[#E7D7C6] bg-white p-6 shadow-sm ${index === 0 || index === 7 ? "lg:col-span-2" : ""}`}>
                <div className="mb-4 inline-flex rounded-2xl bg-[#EFE2D3] p-3"><Icon className="h-6 w-6 text-[#6B3A25]" /></div>
                <h3 className="text-lg font-black">{feature.title}</h3>
                <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">{feature.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="solutions" className="mx-4 overflow-hidden rounded-[2rem] bg-[#311912] sm:mx-6 lg:mx-auto lg:max-w-6xl">
        <div className="grid items-center gap-10 px-6 py-14 sm:px-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-black text-[#FCF8F3] sm:text-4xl">بطاقات ولاء تزيد العودة</h2>
            <p className="mt-4 max-w-md text-base font-bold leading-8 text-[#FCF8F3]/75">{data.settings.loyaltyDescription}</p>
            <Link href="/register" className="mt-8 inline-flex h-12 items-center rounded-2xl bg-[#D9A33F] px-6 text-sm font-black text-[#311912]">تعرف على بطاقات الولاء</Link>
          </div>
          <LoyaltyCards images={data.loyaltyImages} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl overflow-hidden px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center text-2xl font-black sm:text-3xl">علامات تجارية تثق ببرندة</h2>
        {data.brands.length ? (
          <div className="mt-10 overflow-hidden">
            <div className="flex gap-4 transition-transform duration-700" style={{ transform: `translateX(${brandIndex * 8}rem)` }}>
              {data.brands.map((brand) => (
                <div key={brand.id} className="flex min-w-32 flex-col items-center rounded-2xl border border-[#E7D7C6] bg-white p-4">
                  {brand.logoUrl ?   <img src={brand.logoUrl} alt={brand.name} className="h-16 w-16 rounded-xl object-contain" /> : <Store className="h-14 w-14 text-[#6B3A25]" />}
                  <p className="mt-3 text-center text-xs font-black">{brand.name}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-8 text-center font-bold text-[#806A5E]">ستظهر العلامات التجارية المسجلة هنا</p>
        )}
      </section>

      <section id="about" className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[["من نحن", data.settings.aboutUs], ["رؤيتنا", data.settings.vision], ["رسالتنا", data.settings.mission]].map(([title, body]) => (
            <article key={title} className="rounded-3xl border border-[#E7D7C6] bg-white p-6">
              <h3 className="text-xl font-black">{title}</h3>
              <p className="mt-3 text-sm font-bold leading-8 text-[#806A5E]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid items-center gap-8 rounded-[2rem] border border-[#E7D7C6] bg-[#EFE2D3] p-6 sm:p-10 lg:grid-cols-2">
          <div className="flex justify-center"><BrandaLogo variant="brown" width={230} height={92} /></div>
          <div className="text-center lg:text-right">
            <h2 className="text-3xl font-black sm:text-4xl">{data.settings.ctaTitle}</h2>
            <p className="mt-4 text-base font-bold leading-8 text-[#806A5E]">{data.settings.ctaDescription}</p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl bg-[#4A281D] px-8 font-black text-white">ابدأ الآن مجانًا</Link>
              <button type="button" onClick={() => setContactOpen(true)} className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl border border-[#E7D7C6] px-8 font-black">تواصل معنا</button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E7D7C6] px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
          <BrandaLogo variant="brown" width={120} height={48} />
          <div className="flex flex-wrap items-center justify-center gap-5 text-sm font-black">
            <Link href="/careers">التوظيف</Link>
            <button type="button" onClick={() => setContactOpen(true)}>طرق التواصل</button>
            {data.contacts.instagram ? <a href={data.contacts.instagram}><Camera className="h-5 w-5" /></a> : null}
            {data.contacts.facebook ? <a href={data.contacts.facebook}><Globe className="h-5 w-5" /></a> : null}
          </div>
          <p className="text-sm font-bold text-[#806A5E]">© برندة جميع الحقوق محفوظة</p>
        </div>
      </footer>

      {videoOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={() => setVideoOpen(false)}>
          <div className="relative w-full max-w-4xl rounded-[28px] bg-[#111] p-3" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setVideoOpen(false)} className="absolute -top-12 left-0 rounded-full bg-white/15 p-2 text-white"><X className="h-6 w-6" /></button>
            {data.introVideo ? (
              <video src={data.introVideo.url} controls autoPlay className="max-h-[75vh] w-full rounded-2xl" onPlay={() => void recordIntroVideoEventAction("intro_video_view")} />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-2xl text-center font-black text-white">الفيديو التعريفي سيتم إضافته من لوحة إدارة المحتوى</div>
            )}
          </div>
        </div>
      ) : null}
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} contacts={data.contacts} />
    </main>
  );
}
