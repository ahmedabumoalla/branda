"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Menu, X, ShoppingBag, Package, Heart, ChartNoAxesCombined, Store, Users, MessageCircle, ScanLine, Pause, Play } from "lucide-react";
import type { PlatformContactSettings } from "@/lib/data/platform-content";
import type { HomeAccount } from "@/lib/data/home-account";
import type { PublicHomePlan } from "@/lib/platform/public-home-catalog";
import { homeBrands } from "@/lib/marketing/home-brands";
import { FawaselBrandMark } from "@/components/store/fawasel-brand-mark";
import { BrandaHomePricing } from "./branda-home-pricing";
import { HomeContactForm } from "./branda-home-contact";
import shared from "./branda-home.module.css";
import s from "./branda-home-redesign.module.css";

const journeys = [
  { icon: ShoppingBag, title: ["ابدأ بالبيع", "Start with a sale"], body: ["منيو بهويتك، وطلب واضح يوصل للكاشير", "Your branded menu brings a clear order to the counter"], tag: ["المنيو ونقطة البيع", "Menu & point of sale"], detail: ["اعرض أصنافك ورتّب الطلب، ثم اختر طريقة الدفع وأصدر الفاتورة من نفس المسار", "Present your products, build the order, choose payment and issue its invoice in one flow"], items: [["أصناف وأسعار منظمة", "Organized products and prices"], ["خيارات الطلب والدفع", "Ordering and payment options"], ["فواتير مرتبطة بالعملية", "Invoices linked to the sale"]] },
  { icon: Package, title: ["رتّب اللي وراء البيع", "Keep operations in order"], body: ["المخزون والفروع والفريق في سياق واحد", "Inventory, branches and your team stay connected"], tag: ["المخزون والإدارة", "Inventory & operations"], detail: ["تابع حركة الأصناف بين الاستلام والبيع، ونظّم مسؤوليات فريقك وراجع نشاط فروعك", "Track products from receipt to sale, organize team responsibilities and review branch activity"], items: [["حركة الأصناف والمشتريات", "Stock movements and purchases"], ["إدارة الفروع والصلاحيات", "Branches and permissions"], ["تقارير تساعدك تراجع يومك", "Reports to review your day"]] },
  { icon: Heart, title: ["خلّ الزيارة تتكرر", "Give customers a reason to return"], body: ["ولاء يحمل علامتك ويكمّل تجربة عميلك", "Loyalty that carries your identity beyond the visit"], tag: ["العملاء والولاء", "Customers & loyalty"], detail: ["جهّز برنامج الولاء المناسب لنشاطك، واجمع تجربة العميل وبطاقته ومكافآته تحت هويتك", "Build the loyalty program that fits your business, with customer cards and rewards under your brand"], items: [["بطاقات بهوية علامتك", "Cards with your brand identity"], ["أختام ونقاط ومكافآت", "Stamps, points and rewards"], ["Apple Wallet وGoogle Wallet", "Apple Wallet and Google Wallet"]] },
] as const;

export function BrandaHome({ contacts, account, accountHref = "/login", plans = [], plansError = false, featuredBrandSlugs = [] }: {
  contacts: PlatformContactSettings; account?: HomeAccount | null; accountHref?: string;
  plans?: PublicHomePlan[]; plansError?: boolean; featuredBrandSlugs?: string[];
}) {
  const [english, setEnglish] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const [selectedJourney, setSelectedJourney] = useState(0), [selectedPlan, setSelectedPlan] = useState("");
  const [logosPaused, setLogosPaused] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const t = (...labels: string[]) => labels[english ? 1 : 0] ?? labels[0];
  const phone = contacts.whatsapp.replace(/\D/g, "");
  const whatsapp = /^9665\d{8}$/.test(phone) ? phone : /^05\d{8}$/.test(phone) ? `966${phone.slice(1)}` : "966508333556";
  const current = journeys[selectedJourney], JourneyIcon = current.icon;
  const brands = homeBrands.filter(brand => featuredBrandSlugs.includes(brand.slug));
  const nav = [["features", "كيف تعمل برندة", "How it works"], ["clients", "علامات معنا", "Our brands"], ["pricing", "الباقات", "Plans"], ["contact", "تواصل معنا", "Contact"]];
  const termsHref = `https://wa.me/${whatsapp}?text=${encodeURIComponent(t("أرغب في الاطلاع على شروط وأحكام برندة", "Please send me the Branda terms and conditions"))}`;
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);

  return <div className={`${shared.page} ${s.page}`} dir={english ? "ltr" : "rtl"} lang={english ? "en" : "ar"} data-home-design="branda-business-journey">
    <a href="#main-content" className={s.skip}>{t("انتقل للمحتوى", "Skip to content")}</a>
    <header className={s.header}><div className={s.navbar}>
      <a href="#top" aria-label={t("برندة الرئيسية", "Branda home")}><Image src="/brand/barndaksa-logo-brown.png" alt="برندة" width={112} height={48} priority unoptimized /></a>
      <nav className={s.nav} aria-label={t("التنقل الرئيسي", "Main navigation")} id="home-navigation" data-open={menuOpen}>{nav.filter(([id]) => id !== "clients" || brands.length).map(([id, ar, en]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{t(ar, en)}</a>)}</nav>
      <div className={s.navActions}><button type="button" className={s.language} onClick={() => setEnglish(value => !value)} aria-label={t("Switch to English", "التحويل إلى العربية")}>{english ? "عربي" : "EN"}</button><Link className={s.signIn} href={account?.href ?? accountHref}>{account ? t("حسابي", "My account") : t("دخول", "Sign in")}<ArrowUpRight size={16} aria-hidden="true" /></Link><button type="button" ref={menuButton} className={s.menuButton} aria-expanded={menuOpen} aria-controls="home-navigation" aria-label={t("القائمة", "Navigation")} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X /> : <Menu />}</button></div>
    </div></header>

    <main id="main-content">
      <section id="top" className={s.hero}>
        <div className={s.heroIntro}><span className={s.eyebrow}>{t("برندة / مساحة عمل لنشاطك", "BRANDA / YOUR BUSINESS WORKSPACE")}</span><h1>{t("كل يوم شغل", "Every business day")}<br /><span>{t("يصير أوضح", "comes into focus")}</span></h1><p>{t("من أول طلب، إلى آخر حساب، إلى عميل يرجع لك", "From the first order to closing the books and welcoming a customer back")}</p><div className={s.heroActions}><a href="#pricing" className={s.primary}>{t("اختر أدوات نشاطك", "Find your business tools")}<ArrowLeft size={19} aria-hidden="true" /></a><a href="#features" className={s.heroLink}>{t("شوف كيف تتصل التفاصيل", "See how it connects")}<ChevronDown size={18} aria-hidden="true" /></a></div></div>
        <div className={s.heroRoute} aria-label={t("رحلة العمل في برندة", "Your workflow in Branda")}><div className={s.routeHeading}><span>{t("رحلة واحدة", "ONE CONNECTED JOURNEY")}</span><ScanLine size={28} aria-hidden="true" /></div>{journeys.map((journey, index) => <a className={s.routeStop} href="#features" key={journey.title[1]} onClick={() => setSelectedJourney(index)}><span className={s.routeIcon}><journey.icon size={24} aria-hidden="true" /></span><span><strong>{t(...journey.title)}</strong><small>{t(...journey.tag)}</small></span><ArrowLeft size={18} aria-hidden="true" /></a>)}<p>{t("تفاصيل مترابطة، وقرار بيدك", "Connected details. Decisions in your hands.")}</p></div>
        <div className={s.heroFoot}><span>{t("للبيع، للإدارة، للعلاقة اللي تستمر", "FOR SALES, OPERATIONS AND LASTING RELATIONSHIPS")}</span><span>{t("منصة سعودية لإدارة الأعمال", "A Saudi business management platform")}</span></div>
      </section>

      <section id="features" className={`${s.section} ${s.workflow}`}><header className={s.sectionHead}><span className={s.eyebrow}>{t("من أين تبدأ؟", "WHERE DO YOU START?")}</span><h2>{t("اختر جزءًا من يومك", "Choose a part of your day")}<br /><span>{t("وشوف الصورة المتصلة", "See the connected picture")}</span></h2><p>{t("أدوات تخدم مسار العمل، من واجهة العميل إلى تفاصيل الإدارة", "Tools that follow your work, from the customer experience to the operational detail")}</p></header>
        <div className={s.journeyLayout}><div className={s.journeyChoices} role="group" aria-label={t("استكشف أدوات برندة", "Explore Branda tools")}>{journeys.map((journey, index) => <button type="button" key={journey.title[1]} aria-pressed={selectedJourney === index} aria-controls="journey-detail" onClick={() => setSelectedJourney(index)}><journey.icon size={24} aria-hidden="true" /><span><strong>{t(...journey.title)}</strong><small>{t(...journey.body)}</small></span><ArrowLeft size={20} aria-hidden="true" /></button>)}</div><article id="journey-detail" className={s.journeyDetail} aria-live="polite"><div className={s.detailMark}><JourneyIcon size={62} strokeWidth={1} aria-hidden="true" /></div><span className={s.eyebrow}>{t(...current.tag)}</span><h3>{t(...current.title)}</h3><p>{t(...current.detail)}</p><ul>{current.items.map(item => <li key={item[1]}><Check size={17} aria-hidden="true" />{t(...item)}</li>)}</ul><small>{t("تختلف الأدوات المتاحة بحسب الباقة ونوع النشاط", "Available tools depend on your plan and business type")}</small></article></div>
      </section>

      {brands.length > 0 && <section id="clients" className={s.brands}><div className={s.brandsIntro}><span className={s.eyebrow}>{t("علامات معنا", "BRANDS WITH US")}</span><h2>{t("لكل علامة طابعها", "Every brand has its character")}<br />{t("وهنا تبدأ المساحة المشتركة", "This is their shared workspace")}</h2></div><div className={s.logoShowcase}><div className={s.logoViewport} tabIndex={0} aria-label={t("شعارات العملاء", "Customer logos")}><div className={s.logoTrack} data-paused={logosPaused}>{[0, 1].map(copy => <div className={s.logoGroup} key={copy} aria-hidden={copy === 1 ? true : undefined} data-copy={copy}>{brands.map(brand => <div className={s.brandLogo} key={brand.slug} data-brand={copy === 0 ? brand.slug : undefined} data-logo={brand.slug}>{brand.image ? <Image src={brand.image} alt={copy === 0 ? brand.name : ""} width={160} height={90} unoptimized /> : <FawaselBrandMark />}</div>)}</div>)}</div></div><button type="button" className={s.logoPause} aria-pressed={logosPaused} onClick={() => setLogosPaused(value => !value)}>{logosPaused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}{logosPaused ? t("تشغيل الحركة", "Play animation") : t("إيقاف الحركة", "Pause animation")}</button></div></section>}

      <section className={`${s.section} ${s.operations}`} id="bundle"><div><span className={s.eyebrow}>{t("مساحة تكبر معك", "ROOM TO GROW")}</span><h2>{t("ابدأ بما تحتاجه اليوم", "Start with what you need today")}<br />{t("ونظّم الخطوة الجاية", "Organize what comes next")}</h2><p>{t("سواء تدير مقهى أو مطعمًا أو متجرًا، تقدر تجمع البيع والمخزون والعملاء في بيئة عمل واحدة", "Whether you run a café, a restaurant or a store, bring sales, inventory and customers into one workspace")}</p><a href="#contact" className={s.textLink}>{t("خلّنا نتعرف على نشاطك", "Tell us about your business")}<ArrowLeft size={19} aria-hidden="true" /></a></div><div className={s.operationList}>{[[Store, "نشاطك وفروعك", "Your business and branches", "تابع العمل من مكان واحد", "Follow operations from one place"], [Users, "فريقك وعملاؤك", "Your team and customers", "مسؤوليات واضحة وتجربة تحمل هويتك", "Clear responsibilities and a branded experience"], [ChartNoAxesCombined, "أرقامك وقراراتك", "Your numbers and decisions", "ارجع للبيانات وقت ما تحتاجها", "Return to your data whenever you need it"]].map(([Element, ar, en, body, bodyEn]) => { const Symbol = Element as typeof Store; return <article key={String(en)}><Symbol size={28} strokeWidth={1.4} aria-hidden="true" /><div><h3>{t(String(ar), String(en))}</h3><p>{t(String(body), String(bodyEn))}</p></div></article>; })}</div></section>

      <BrandaHomePricing plans={plans} error={plansError} t={t} choosePlan={setSelectedPlan} />
      <section id="faq" className={`${s.section} ${s.faq}`}><header><span className={s.eyebrow}>{t("قبل ما تبدأ", "BEFORE YOU START")}</span><h2>{t("خلّ التفاصيل واضحة", "Make the details clear")}</h2></header><div>{[
        ["كيف أختار الباقة؟", "How do I choose a plan?", "راجع الأدوات المدرجة في كل باقة، أو أرسل لنا نوع نشاطك واحتياجاتك لنساعدك في الاختيار", "Review the tools in each plan, or tell us about your business so we can help you choose"],
        ["هل تظهر هوية علامتي للعملاء؟", "Will customers see my brand?", "يمكن تخصيص المنيو وبطاقات الولاء بهوية علامتك ضمن الأدوات المتاحة لحسابك", "Your menu and loyalty cards can carry your brand identity through the tools available to your account"],
        ["كيف أجهز نشاطي للبدء؟", "How do I get started?", "اختر باقتك وتواصل مع الفريق لتجهيز بيانات النشاط والأصناف والإعدادات التي تحتاجها", "Choose a plan and contact the team to prepare your business details, products and settings"],
      ].map(([ar, en, body, bodyEn]) => <details key={en}><summary>{t(ar, en)}<ChevronDown size={18} aria-hidden="true" /></summary><p>{t(body, bodyEn)}</p></details>)}</div></section>

      <section id="contact" className={s.contact}><div className={s.contactCopy}><span className={s.eyebrow}>{t("نتكلم عن شغلك؟", "LET’S TALK BUSINESS")}</span><h2>{t("قل لنا وين وصلت", "Tell us where you are")}<br />{t("ونرتّب معك البداية", "We’ll help with the next step")}</h2><p>{t("شاركنا نوع نشاطك والأدوات اللي تحتاجها، وفريق برنده يتواصل معك", "Share your business type and the tools you need. The Branda team will get in touch")}</p><a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className={s.textLink}><MessageCircle size={21} aria-hidden="true" />{t("تواصل مباشرة عبر واتساب", "Talk to us on WhatsApp")}</a></div><HomeContactForm t={t} whatsapp={whatsapp} selectedPlan={selectedPlan} /></section>
    </main>
    <footer className={s.footer}><Image src="/brand/barndaksa-logo-brown.png" alt="برندة" width={112} height={48} unoptimized /><p>{t("شغلك، بتفاصيله، في مكانه", "Your business. Every detail in place.")}</p><div><a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t("أرغب في روابط تنزيل تطبيق برندة", "Please send me the Branda app download links"))}`} target="_blank" rel="noopener noreferrer">{t("تطبيق برنده", "Branda app")}</a><a href={termsHref} target="_blank" rel="noopener noreferrer">{t("الشروط والأحكام", "Terms and conditions")}</a><a href="#top">{t("للأعلى", "Back to top")} ↑</a></div></footer>
  </div>;
}
