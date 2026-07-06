"use client";

import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ExternalLink,
  Gift,
  LayoutGrid,
  MapPin,
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
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DependencyList,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  recordIntroVideoEventAction,
  submitContactRequestAction,
} from "@/app/actions/platform-content";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { BRAND_COLORS as C } from "@/lib/ui/brand-colors";
import type { PublicPlatformHomeData } from "@/lib/data/platform-content";

// BARNDAKSA_INTRO_VIDEO_PRODUCTION_SRC_FIX
function platformMediaStreamUrl(id: string) {
  return `/api/public/platform-media/${encodeURIComponent(id)}`;
}

const DEFAULT_HERO =
  "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=1200&h=900&fit=crop&q=80";

const ARABIC_FONT_STACKS = {
  system: '"Tajawal", "Cairo", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  cairo: '"Cairo", "Tajawal", system-ui, sans-serif',
  tajawal: '"Tajawal", "Cairo", system-ui, sans-serif',
  "ibm-plex-sans-arabic": '"IBM Plex Sans Arabic", "Tajawal", system-ui, sans-serif',
  "noto-kufi-arabic": '"Noto Kufi Arabic", "Tajawal", system-ui, sans-serif',
} as const;

function platformFontFamily(font: PublicPlatformHomeData["settings"]["fontFamily"]) {
  return ARABIC_FONT_STACKS[font] ?? ARABIC_FONT_STACKS.system;
}

function controlledFontSize(value: number, min: number, max: number) {
  const safeValue = Number.isFinite(value) ? Math.round(value) : min;
  const clamped = Math.min(max, Math.max(min, safeValue));
  return `clamp(${min}px, ${clamped}px, ${max}px)`;
}

function useOverflowingRow(dependencies: DependencyList) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      setIsOverflowing(content.scrollWidth > container.clientWidth + 1);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    resizeObserver.observe(content);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, dependencies);

  return { containerRef, contentRef, isOverflowing };
}

function OverflowMarquee({
  children,
  itemCount,
  durationSeconds,
  itemSetClassName = "",
}: {
  children: ReactNode;
  itemCount: number;
  durationSeconds: number;
  itemSetClassName?: string;
}) {
  const { containerRef, contentRef, isOverflowing } = useOverflowingRow([itemCount]);
  const marqueeStyle = isOverflowing
    ? ({ "--branda-marquee-duration": `${durationSeconds}s` } as CSSProperties)
    : undefined;

  return (
    <div ref={containerRef} className="w-full overflow-hidden" dir="ltr">
      <div
        className={
          isOverflowing
            ? "flex w-max animate-branda-marquee-right"
            : "flex w-full justify-center"
        }
        style={marqueeStyle}
      >
        <div
          ref={contentRef}
          className={`flex min-w-0 shrink-0 flex-row-reverse gap-4 pe-4 ${itemSetClassName}`}
          dir="rtl"
        >
          {children}
        </div>
        {isOverflowing ? (
          <div
            aria-hidden="true"
            className={`flex shrink-0 flex-row-reverse gap-4 pe-4 ${itemSetClassName}`}
            dir="rtl"
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.5 0 .15 5.35.15 11.93c0 2.1.55 4.16 1.6 5.97L.05 24l6.24-1.64a11.9 11.9 0 0 0 5.79 1.47h.01c6.58 0 11.93-5.35 11.93-11.93 0-3.18-1.24-6.18-3.5-8.42ZM12.09 21.8h-.01a9.88 9.88 0 0 1-5.03-1.38l-.36-.21-3.7.97.99-3.61-.23-.37a9.85 9.85 0 0 1-1.51-5.27c0-5.44 4.43-9.87 9.87-9.87a9.8 9.8 0 0 1 6.98 2.9 9.8 9.8 0 0 1 2.89 6.96c-.01 5.45-4.44 9.88-9.89 9.88Zm5.41-7.39c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.87 1.21 3.07c.15.2 2.09 3.19 5.06 4.47.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}

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

function AdaptiveMessage({ text, fontSize }: { text: string; fontSize: number }) {
  return (
    <p
      className="font-black leading-relaxed"
      style={{
        color: C.coffeeBrown,
        fontSize: controlledFontSize(fontSize, 18, 42),
      }}
    >
      {text || "ضع عبارتك الخاصة من لوحة إدارة محتوى المنصة"}
    </p>
  );
}

function LoyaltyCards({ images }: { images: PublicPlatformHomeData["loyaltyImages"] }) {
  const loyaltyImage = images[0];
  if (loyaltyImage) {
    return (
      <div className="relative flex min-h-[320px] items-center justify-center">
        <img
          src={loyaltyImage.url}
          alt={loyaltyImage.altText || "بطاقة ولاء بارنداكسا"}
          className="max-h-[340px] w-full max-w-md rounded-[28px] object-cover shadow-2xl"
        />
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
          <BarndaksaLogo variant={index === 0 ? "brown" : "dark"} width={92} height={36} />
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
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState("");

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setSubmitError("");
    try {
      await submitContactRequestAction({ fullName, email, message });
      setState("done");
      setFullName("");
      setEmail("");
      setMessage("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "تعذر إرسال الرسالة، حاول مرة أخرى");
      setState("error");
    }
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
          <>
            {state === "error" && submitError ? (
              <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
                {submitError}
              </p>
            ) : null}
            <form onSubmit={submit} className="mt-5 space-y-3">
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم" className="h-14 w-full rounded-2xl border border-[#E7D7C6] bg-white px-4 font-bold outline-none" />
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" className="h-14 w-full rounded-2xl border border-[#E7D7C6] bg-white px-4 font-bold outline-none" />
            <textarea required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="اكتب رسالتك" className="min-h-32 w-full rounded-2xl border border-[#E7D7C6] bg-white p-4 font-bold outline-none" />
            <button disabled={state === "saving"} className="h-14 w-full rounded-2xl bg-[#4A281D] font-black text-white">
              {state === "saving" ? "جاري الإرسال" : "إرسال"}
            </button>
            </form>
          </>
        )}
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-bold text-[#806A5E]">
          {contacts.email ? <span className="inline-flex items-center gap-1"><Mail className="h-4 w-4" />{contacts.email}</span> : null}
          {contacts.whatsapp ? <span className="inline-flex items-center gap-1"><Phone className="h-4 w-4" />{contacts.whatsapp}</span> : null}
        </div>
      </div>
    </div>
  );
}

function promotionLabel(type: PublicPlatformHomeData["promotions"][number]["itemType"]) {
  if (type === "product") return "منتج مختار";
  if (type === "offer") return "عرض خاص";
  if (type === "reservation") return "حجز وخدمة";
  return "فرع إلكتروني";
}

function promotionCta(type: PublicPlatformHomeData["promotions"][number]["itemType"]) {
  if (type === "product") return "شاهد المنتج";
  if (type === "offer") return "استفد من العرض";
  if (type === "reservation") return "احجز الآن";
  return "زيارة الفرع الإلكتروني";
}

function PromotionIcon({ type }: { type: PublicPlatformHomeData["promotions"][number]["itemType"] }) {
  if (type === "product") return <ShoppingBag className="h-4 w-4" />;
  if (type === "offer") return <Gift className="h-4 w-4" />;
  if (type === "reservation") return <CalendarDays className="h-4 w-4" />;
  return <Store className="h-4 w-4" />;
}

function PromotionImage({ item }: { item: PublicPlatformHomeData["promotions"][number] }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (item.imageUrl && !imageFailed) {
    return (
      <img
        src={item.imageUrl}
        alt={item.title}
        className="h-full w-full object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#EFE2D3] text-[#6B3A25]">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#D9A33F]/45 bg-[#FCF8F3] shadow-sm">
        <Store className="h-8 w-8" />
      </span>
      <span className="mt-3 text-sm font-black">برندة</span>
    </div>
  );
}

export function PlatformHomePage({ data }: { data: PublicPlatformHomeData }) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const heroImages = data.heroImages.length ? data.heroImages : null;
  const homeFontFamily = platformFontFamily(data.settings.fontFamily);

  useEffect(() => {
    if (!heroImages || heroImages.length < 2) return;
    const interval = window.setInterval(
      () => setHeroIndex((current) => (current + 1) % heroImages.length),
      data.settings.carouselIntervalSeconds * 1000
    );
    return () => window.clearInterval(interval);
  }, [heroImages, data.settings.carouselIntervalSeconds]);

  function openVideo() {
    setVideoOpen(true);
    void recordIntroVideoEventAction("intro_video_click").catch((error) => {
      console.error("[intro_video_click]", error);
    });
  }

  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden" style={{ background: C.creamBase, color: C.espressoDark, fontFamily: homeFontFamily }}>
      <style>{`
        @keyframes branda-marquee-right {
          from { transform: translateX(-50%); }
          to { transform: translateX(0); }
        }

        .animate-branda-marquee-right {
          animation: branda-marquee-right var(--branda-marquee-duration, 34s) linear infinite;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-branda-marquee-right {
            animation: none;
            transform: translateX(0);
          }
        }
      `}</style>
      <header className="sticky top-0 z-50 border-b backdrop-blur-md" style={{ borderColor: C.borderSand, background: `${C.creamBase}ed` }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/"><BarndaksaLogo variant="brown" width={140} height={56} priority /></Link>
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
          <span className="inline-block rounded-full bg-[#EFE2D3] px-5 py-2 font-black text-[#6B3A25]" style={{ fontSize: controlledFontSize(data.settings.heroBadgeFontSize, 11, 20) }}>
            {data.settings.heroBadge}
          </span>
          <h1 className="mt-6 font-black leading-tight" style={{ fontSize: controlledFontSize(data.settings.heroTitleFontSize, 30, 60) }}>{data.settings.heroTitle}</h1>
          <p className="mx-auto mt-5 max-w-3xl font-bold leading-9 text-[#806A5E]" style={{ fontSize: controlledFontSize(data.settings.heroDescriptionFontSize, 14, 24) }}>
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
                <img key={item.id} src={item.url} alt={item.altText || "واجهة بارنداكسا"} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === heroIndex ? "opacity-100" : "opacity-0"}`} />
              )) : (
                <img src={DEFAULT_HERO} alt="واجهة بارنداكسا الأساسية" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
            <div className="flex items-center rounded-[1.5rem] border border-[#E7D7C6] bg-white/70 p-7 sm:p-9">
              <AdaptiveMessage text={data.settings.heroSideText} fontSize={data.settings.heroSideTextFontSize} />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center font-black" style={{ fontSize: controlledFontSize(data.settings.featuresTitleFontSize, 24, 46) }}>{data.settings.featuresTitle}</h2>
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
            <h2 className="font-black text-[#FCF8F3]" style={{ fontSize: controlledFontSize(data.settings.loyaltyTitleFontSize, 24, 46) }}>بطاقات ولاء تزيد العودة</h2>
            <p className="mt-4 max-w-md font-bold leading-8 text-[#FCF8F3]/75" style={{ fontSize: controlledFontSize(data.settings.loyaltyDescriptionFontSize, 14, 24) }}>{data.settings.loyaltyDescription}</p>
            <Link href="/register" className="mt-8 inline-flex h-12 items-center rounded-2xl bg-[#D9A33F] px-6 text-sm font-black text-[#311912]">تعرف على بطاقات الولاء</Link>
          </div>
          <LoyaltyCards images={data.loyaltyImages} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl overflow-hidden px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center text-2xl font-black sm:text-3xl">علامات تجارية تثق بنا</h2>
        {data.brands.length ? (
          <div className="mt-10">
            <OverflowMarquee itemCount={data.brands.length} durationSeconds={32} itemSetClassName="items-stretch">
              {data.brands.map((brand) => {
                const content = (
                  <>
                    {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} className="h-16 w-16 rounded-xl object-contain" /> : <Store className="h-14 w-14 text-[#6B3A25]" />}
                    <p className="mt-3 text-center text-xs font-black">{brand.name}</p>
                    {brand.locationLabel ? <p className="mt-1 text-center text-[11px] font-bold text-[#806A5E]">{brand.locationLabel}</p> : null}
                  </>
                );

                return brand.href ? (
                  <Link key={brand.id} href={brand.href} className="flex min-w-32 flex-col items-center rounded-2xl border border-[#E7D7C6] bg-white p-4 transition hover:-translate-y-1 hover:shadow-lg">
                    {content}
                  </Link>
                ) : (
                  <div key={brand.id} className="flex min-w-32 flex-col items-center rounded-2xl border border-[#E7D7C6] bg-white p-4">
                    {content}
                  </div>
                );
              })}
            </OverflowMarquee>
          </div>
        ) : (
          <p className="mt-8 text-center font-bold text-[#806A5E]">ستظهر العلامات التجارية المسجلة هنا</p>
        )}
      </section>

      {data.promotions.length ? (
        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="inline-flex rounded-full bg-[#EFE2D3] px-4 py-2 text-xs font-black text-[#6B3A25]">
                اكتشف علاماتنا وعروضهم
              </span>
              <h2 className="mt-4 text-2xl font-black sm:text-3xl">
                اختيارات جاهزة من فروع برندة الإلكترونية
              </h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-7 text-[#806A5E]">
              منتجات وعروض وخدمات حجز يختارها فريق المنصة من العلامات النشطة لتصل للزائر مباشرة إلى الفرع المناسب.
            </p>
          </div>

          <OverflowMarquee itemCount={data.promotions.length} durationSeconds={44} itemSetClassName="items-stretch">
            {data.promotions.map((item) => (
              <article
                key={`${item.itemType}-${item.id ?? item.itemId ?? item.cafeId}`}
                className="flex h-full w-[min(20rem,calc(100vw-2rem))] shrink-0 flex-col overflow-hidden rounded-3xl border border-[#E7D7C6] bg-white shadow-sm sm:w-80"
              >
                <div className="relative h-44 bg-[#EFE2D3]">
                  <PromotionImage item={item} />
                  <span className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-[#FCF8F3]/95 px-3 py-2 text-xs font-black text-[#6B3A25] shadow-sm">
                    <PromotionIcon type={item.itemType} />
                    {item.badge || promotionLabel(item.itemType)}
                  </span>
                </div>
                <div className="p-5">
                  <div className="mb-4 flex items-center gap-3">
                    {item.brandLogoUrl ? (
                      <img src={item.brandLogoUrl} alt={item.brandName} className="h-12 w-12 rounded-2xl border border-[#E7D7C6] bg-white object-contain" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFE2D3]">
                        <Store className="h-5 w-5 text-[#6B3A25]" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[#311912]">{item.brandName}</p>
                      {item.locationLabel ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#806A5E]">
                          <MapPin className="h-3.5 w-3.5" />
                          {item.locationLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <h3 className="line-clamp-2 text-xl font-black leading-8 text-[#311912]">{item.title}</h3>
                  {item.subtitle ? (
                    <p className="mt-2 line-clamp-2 min-h-14 text-sm font-bold leading-7 text-[#806A5E]">
                      {item.subtitle}
                    </p>
                  ) : (
                    <p className="mt-2 min-h-14 text-sm font-bold leading-7 text-[#806A5E]">
                      تجربة مختارة من الفرع الإلكتروني للعلامة.
                    </p>
                  )}
                  <Link
                    href={item.href}
                    className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4A281D] px-5 text-sm font-black text-white"
                  >
                    {promotionCta(item.itemType)}
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </OverflowMarquee>
        </section>
      ) : null}

      <section id="about" className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[["من نحن", data.settings.aboutUs], ["رؤيتنا", data.settings.vision], ["رسالتنا", data.settings.mission]].map(([title, body]) => (
            <article key={title} className="rounded-3xl border border-[#E7D7C6] bg-white p-6">
              <h3 className="text-xl font-black">{title}</h3>
              <p className="mt-3 font-bold leading-8 text-[#806A5E]" style={{ fontSize: controlledFontSize(data.settings.aboutCardsFontSize, 12, 22) }}>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid items-center gap-8 rounded-[2rem] border border-[#E7D7C6] bg-[#EFE2D3] p-6 sm:p-10 lg:grid-cols-2">
          <div className="flex justify-center"><BarndaksaLogo variant="brown" width={230} height={92} /></div>
          <div className="text-center lg:text-right">
            <h2 className="font-black" style={{ fontSize: controlledFontSize(data.settings.ctaTitleFontSize, 24, 46) }}>{data.settings.ctaTitle}</h2>
            <p className="mt-4 font-bold leading-8 text-[#806A5E]" style={{ fontSize: controlledFontSize(data.settings.ctaDescriptionFontSize, 14, 24) }}>{data.settings.ctaDescription}</p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl bg-[#4A281D] px-8 font-black text-white">ابدأ الآن مجانًا</Link>
              <button type="button" onClick={() => setContactOpen(true)} className="inline-flex h-14 min-w-[180px] items-center justify-center rounded-2xl border border-[#E7D7C6] px-8 font-black">تواصل معنا</button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E7D7C6] px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
          <BarndaksaLogo variant="brown" width={120} height={48} />
          <div className="flex flex-wrap items-center justify-center gap-5 text-sm font-black">
            <Link href="/careers">التوظيف</Link>
            <button type="button" onClick={() => setContactOpen(true)}>طرق التواصل</button>
            {data.contacts.instagram ? <a href={data.contacts.instagram}><Camera className="h-5 w-5" /></a> : null}
            {data.contacts.facebook ? <a href={data.contacts.facebook}><Globe className="h-5 w-5" /></a> : null}
            <a
              href="https://wa.me/966508424401"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="التواصل عبر واتساب"
              className="text-[#25D366]"
            >
              <WhatsAppIcon className="h-5 w-5" />
            </a>
          </div>
          <p className="text-sm font-bold text-[#806A5E]">© برندة جميع الحقوق محفوظة</p>
        </div>
      </footer>

      {videoOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={() => setVideoOpen(false)}>
          <div className="relative w-full max-w-4xl rounded-[28px] bg-[#111] p-3" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setVideoOpen(false)} className="absolute -top-12 left-0 rounded-full bg-white/15 p-2 text-white"><X className="h-6 w-6" /></button>
            {data.introVideo ? (
              <video
                key={data.introVideo.id}
                src={platformMediaStreamUrl(data.introVideo.id)}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="max-h-[75vh] w-full rounded-2xl"
                onPlay={() => {
                  void recordIntroVideoEventAction("intro_video_view").catch((error) => {
                    console.error("[intro_video_view]", error);
                  });
                }}
              />
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
