"use client";

import Link from "next/link";
import { motion, useInView, useScroll } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpLeft, Check, ChevronLeft, ChevronRight, Coffee, ExternalLink, Gift, Globe, LayoutGrid, LoaderCircle, Mail, MapPin, Menu, MessageCircle, Pause, Play, ShieldCheck, Sparkles, Store, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { recordIntroVideoEventAction, submitContactRequestAction } from "@/app/actions/platform-content";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import type { PublicPlatformHomeData } from "@/lib/data/platform-content";
import { HomeProductPreview } from "./home-product-preview";
import { homeMotion, useHomeMotion } from "./home-motion";
import styles from "./platform-home-page.module.css";

const fontFamilies = {
  system: '"Branda Home", sans-serif',
  tajawal: '"Branda Home", sans-serif',
  cairo: '"Cairo", "Branda Home", sans-serif',
  "ibm-plex-sans-arabic": '"IBM Plex Sans Arabic", "Branda Home", sans-serif',
  "noto-kufi-arabic": '"Noto Kufi Arabic", "Branda Home", sans-serif',
};
const features = [
  { icon: LayoutGrid, title: "منيو يليق بعلامتك", text: "منتجات وصور وأسعار في منيو مستقل يسهل مشاركته وتحديثه", tag: "حضور يترك انطباعًا" },
  { icon: Gift, title: "سبب جديد للعودة", text: "بطاقات ولاء وأختام ومكافآت تقرّب عملاءك من علامتك", tag: "علاقة تستمر" },
  { icon: Sparkles, title: "كل عرض له وقته", text: "اعرض جديدك وقدّم عروضك ومناسباتك في مساحة تحمل هويتك", tag: "تفاصيل تتجدد" },
];
const navigation = [["#features", "المزايا"], ["#solutions", "الحلول"], ["#about", "من نحن"], ["/careers", "الوظائف"]] as const;
const setupSteps = [
  { icon: Store, title: "أنشئ مساحة علامتك", description: "ابدأ باسمك وهويتك" },
  { icon: LayoutGrid, title: "أضف تفاصيلك", description: "منتجاتك وصورها وأسعارها" },
  { icon: Users, title: "شاركها مع عملائك", description: "رابط واحد لتجربة متكاملة" },
];
function copy(text: string) { return text.trim().replace(/[.،,]+$/u, ""); }
function size(value: number, fallback: number, min: number, max: number) { return `${Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback))}px`; }

function MediaImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img src={src} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className={`${styles.mediaFallback} ${className ?? ""}`} role="img" aria-label={alt}><Store size={34} aria-hidden="true" /><span>برندة</span></span>;
}

function HomeDialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.videoDialog : ""}`} aria-label={title} onClose={onClose}>
    <div className={styles.dialogHeading}><h2>{title}</h2><button type="button" onClick={() => ref.current?.close()} aria-label={`إغلاق ${title}`}><X size={22} aria-hidden="true" /></button></div>
    {children}
  </dialog>;
}

function ContactModal({ open, onClose, contacts }: { open: boolean; onClose: () => void; contacts: PublicPlatformHomeData["contacts"] }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    setState("saving"); setError("");
    try {
      await submitContactRequestAction({ fullName, email, message });
      setState("done"); setFullName(""); setEmail(""); setMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إرسال الرسالة حاول مرة أخرى");
      setState("error");
    }
  }
  return <HomeDialog open={open} onClose={onClose} title="تواصل معنا">
    <p className={styles.dialogIntro}>نتطلع للتعرف على علامتك وكيف يمكننا مساعدتك</p>
    {state === "done" ? <p className={styles.success} role="status"><Check size={22} aria-hidden="true" />وصلتنا رسالتك وسنتواصل معك قريبًا</p> : <form onSubmit={submit} aria-busy={state === "saving"}>
      <fieldset className={styles.contactFields} disabled={state === "saving"}>
        <label htmlFor="contact-name">الاسم<input id="contact-name" name="name" autoComplete="name" required maxLength={160} value={fullName} onChange={event => setFullName(event.target.value)} /></label>
        <label htmlFor="contact-email">البريد الإلكتروني<input id="contact-email" name="email" type="email" dir="ltr" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label htmlFor="contact-message">كيف نقدر نساعدك؟<textarea id="contact-message" name="message" required maxLength={5000} value={message} onChange={event => setMessage(event.target.value)} /></label>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <button className={styles.primaryButton} type="submit" disabled={state === "saving"}>{state === "saving" ? "جارٍ إرسال رسالتك" : "إرسال الرسالة"}{state === "saving" ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" /> : <ArrowLeft size={18} aria-hidden="true" />}</button>
      </fieldset>
    </form>}
    <div className={styles.contactDetails}>{contacts.email ? <a href={`mailto:${contacts.email}`}><Mail size={17} aria-hidden="true" /><bdi>{contacts.email}</bdi></a> : null}{contacts.whatsapp ? <span><MessageCircle size={17} aria-hidden="true" /><bdi>{contacts.whatsapp}</bdi></span> : null}</div>
  </HomeDialog>;
}

function MediaGallery({ images, active, interval }: { images: PublicPlatformHomeData["heroImages"]; active: boolean; interval: number }) {
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const inView = useInView(region);
  useEffect(() => {
    if (!active || interacting || !inView || images.length < 2) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % images.length), Math.max(5, Number.isFinite(interval) ? interval : 5) * 1000);
    return () => window.clearInterval(timer);
  }, [active, interacting, inView, images.length, interval]);
  if (!images.length) return null;
  const selected = index % images.length;
  return <div ref={region} className={styles.gallery} onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocusCapture={() => setInteracting(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }} role="region" aria-roledescription="عرض شرائح" aria-label="تجربة برندة بالصور">
    <div className={styles.galleryImage}><MediaImage key={images[selected].id} src={images[selected].url} alt={images[selected].altText || "معاينة واجهة برندة"} /></div>
    {images.length > 1 ? <div className={styles.galleryControls}><button type="button" aria-label="الصورة السابقة" onClick={() => setIndex((selected + images.length - 1) % images.length)}><ChevronRight size={20} aria-hidden="true" /></button><span aria-live={interacting || !active ? "polite" : "off"}>{selected + 1} / {images.length}</span><button type="button" aria-label="الصورة التالية" onClick={() => setIndex((selected + 1) % images.length)}><ChevronLeft size={20} aria-hidden="true" /></button></div> : null}
  </div>;
}

function LoyaltyShowcase({ images }: { images: PublicPlatformHomeData["loyaltyImages"] }) {
  if (images.length) return <div className={styles.loyaltyAsset}><MediaImage src={images[0].url} alt={images[0].altText || "بطاقة ولاء تحمل هوية علامتك"} /></div>;
  return <div className={styles.walletScene} aria-label="معاينة توضيحية لبطاقة الولاء">
    <div className={styles.walletBack} aria-hidden="true" /><div className={styles.walletFront}>
      <div className={styles.walletTop}><BarndaksaLogo variant="brown" width={94} height={38} /><span>لأهل علامتك</span></div>
      <p>كل زيارة حكاية<em>ومكافأتك تتممها</em></p>
      <div className={styles.walletStamps}>{[0, 1, 2, 3, 4, 5].map(index => <span key={index} data-filled={index < 4}>{index < 4 ? <Coffee size={22} aria-hidden="true" /> : <Gift size={22} aria-hidden="true" />}</span>)}</div>
      <div className={styles.walletBottom}><span>هويتك أقرب لعملائك</span><Gift size={20} aria-hidden="true" /></div>
    </div><span className={styles.walletCaption}>معاينة توضيحية</span>
  </div>;
}

export function PlatformHomePage({ data }: { data: PublicPlatformHomeData }) {
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const { root, active, reduced } = useHomeMotion(paused);
  const { scrollYProgress } = useScroll();
  const promotionRow = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const titleParts = copy(data.settings.heroTitle).split(/\s[-–—]\s/);
  const whatsappDigits = data.contacts.whatsapp.replace(/\D/g, "").replace(/^00/, "");
  const whatsapp = /^05\d{8}$/.test(whatsappDigits) ? `966${whatsappDigits.slice(1)}` : whatsappDigits || "966508424401";
  const pageStyle = {
    fontFamily: fontFamilies[data.settings.fontFamily] ?? fontFamilies.system,
    "--hero-size": size(data.settings.heroTitleFontSize, 60, 42, 76),
    "--hero-description": size(data.settings.heroDescriptionFontSize, 18, 16, 22),
    "--badge-size": size(data.settings.heroBadgeFontSize, 13, 12, 16),
    "--side-size": size(data.settings.heroSideTextFontSize, 30, 24, 38),
    "--section-size": size(data.settings.featuresTitleFontSize, 38, 28, 48),
    "--loyalty-size": size(data.settings.loyaltyTitleFontSize, 40, 30, 48),
    "--loyalty-description": size(data.settings.loyaltyDescriptionFontSize, 18, 16, 22),
    "--cta-size": size(data.settings.ctaTitleFontSize, 40, 28, 48),
    "--cta-description": size(data.settings.ctaDescriptionFontSize, 18, 16, 22),
    "--about-size": size(data.settings.aboutCardsFontSize, 16, 15, 20),
    "--motion-fast": `${homeMotion.duration.fast}s`,
    "--motion-slow": `${homeMotion.duration.slow}s`,
    "--motion-stagger": `${homeMotion.stagger}s`,
  } as CSSProperties;

  function openVideo() {
    if (!data.introVideo) { document.getElementById("product-demo")?.scrollIntoView({ behavior: active ? "smooth" : "instant", block: "center" }); return; }
    setVideoError(false); setVideoOpen(true);
    void recordIntroVideoEventAction("intro_video_click").catch(() => {});
  }
  function closeVideo() { video.current?.pause(); setVideoOpen(false); }

  return <main ref={root} dir="rtl" className={styles.page} style={pageStyle} data-motion={active ? "on" : "off"} data-reduced={reduced}>
    <a className={styles.skipLink} href="#main-content">انتقل إلى المحتوى</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" aria-label="برندة الرئيسية" className={styles.logo}><BarndaksaLogo variant="brown" width={114} height={46} priority /></Link>
        <nav className={styles.desktopNav} aria-label="القائمة الرئيسية">{navigation.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        <div className={styles.headerActions}>
          <Link href="/login" className={styles.loginLink}>تسجيل الدخول</Link>
          <Link href="/register" className={styles.headerCta}>ابدأ مجانًا <ArrowUpLeft size={17} aria-hidden="true" /></Link>
          <button type="button" className={styles.motionButton} aria-label={paused ? "تشغيل حركة الصفحة" : "إيقاف حركة الصفحة"} aria-pressed={paused} onClick={() => setPaused(current => !current)}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>
          <button ref={mobileTrigger} type="button" className={styles.menuButton} aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={menuOpen} aria-controls="home-mobile-nav" onClick={() => setMenuOpen(current => !current)}>{menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
        </div>
      </div>
      {menuOpen ? <nav id="home-mobile-nav" className={styles.mobileNav} aria-label="قائمة الجوال" onKeyDown={event => { if (event.key === "Escape") { setMenuOpen(false); mobileTrigger.current?.focus(); } }}>{navigation.map(([href, label]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)}>{label}<ArrowUpLeft size={16} aria-hidden="true" /></Link>)}<Link href="/login">تسجيل الدخول<ArrowUpLeft size={16} aria-hidden="true" /></Link><Link href="/register">ابدأ مجانًا<ArrowUpLeft size={16} aria-hidden="true" /></Link></nav> : null}
      <motion.div className={styles.scrollProgress} style={{ scaleX: active ? scrollYProgress : 0 }} aria-hidden="true" />
    </header>

    <section id="main-content" className={`${styles.container} ${styles.hero}`} aria-labelledby="home-title">
      <div className={styles.heroCopy}>
        <span className={styles.heroBadge}><span aria-hidden="true" />{copy(data.settings.heroBadge)}</span>
        <h1 id="home-title">{titleParts.map((part, index) => <span key={index} className={styles.heroLine} style={{ "--line-index": index } as CSSProperties}>{part}</span>)}</h1>
        <p className={styles.heroDescription}>{copy(data.settings.heroDescription)}</p>
        <div className={styles.heroActions}><Link href="/register" className={styles.primaryButton}>ابدأ تجربة علامتك <ArrowUpLeft size={20} aria-hidden="true" /></Link><button type="button" className={styles.videoButton} onClick={openVideo}><span><Play size={16} aria-hidden="true" /></span>{data.introVideo ? "شاهد كيف تعمل برندة" : "استكشف التجربة"}</button></div>
        <div className={styles.trialNote}><ShieldCheck size={17} aria-hidden="true" /><span>٧ أيام لتجربة المنيو بدون بطاقة دفع</span></div>
        <a href="#features" className={styles.discover}>تفاصيل صغيرة تصنع فرقًا كبيرًا <ArrowDown size={17} aria-hidden="true" /></a>
      </div>
      <div id="product-demo" className={styles.heroProduct}><HomeProductPreview animate={active} /></div>
    </section>

    <div className={`${styles.container} ${styles.serviceStrip}`}><span>من أول انطباع إلى الزيارة القادمة</span><div><LayoutGrid size={17} aria-hidden="true" />منيو يحمل هويتك</div><div><Gift size={17} aria-hidden="true" />ولاء يقرب عملاءك</div><div><Sparkles size={17} aria-hidden="true" />عروض تتجدد معك</div></div>

    <section id="features" className={`${styles.container} ${styles.section}`} aria-labelledby="features-heading">
      <div className={styles.sectionHeading} data-reveal><div><span className={styles.eyebrow}>حضور يليق بعلامتك</span><h2 id="features-heading">{copy(data.settings.featuresTitle)}</h2></div><p>أدوات تعمل معًا لتبقى التفاصيل بين يديك<br />والتجربة أقرب إلى عملائك</p></div>
      <div className={styles.featureGrid}>{features.map((feature, index) => <article key={feature.title} className={styles.featureCard} data-reveal data-delay={index}><div className={styles.featureTop}><feature.icon size={26} strokeWidth={1.5} aria-hidden="true" /><ArrowUpLeft size={18} aria-hidden="true" /></div><span className={styles.featureTag}>{feature.tag}</span><h3>{feature.title}</h3><p>{feature.text}</p><div className={styles.featureIllustration} data-kind={index} aria-hidden="true">{index === 0 ? <><span /><span /><span /></> : index === 1 ? <>{[0, 1, 2, 3, 4].map(item => <i key={item}>{item < 3 ? <Coffee size={22} /> : <Gift size={22} />}</i>)}</> : <><span>جديد علامتك</span><Sparkles size={36} /></>}</div></article>)}</div>
    </section>

    <section id="solutions" className={styles.loyaltySection} aria-labelledby="loyalty-heading"><div className={`${styles.container} ${styles.loyaltyInner}`}>
      <div data-reveal><span className={styles.eyebrow}>لأن العلاقة لا تنتهي عند الزيارة</span><h2 id="loyalty-heading">زيارة أولى<br /><em>وعلاقة تستمر</em></h2><p>{copy(data.settings.loyaltyDescription)}</p><ul><li><Check size={18} aria-hidden="true" />بطاقة ولاء تحمل هوية علامتك</li><li><Check size={18} aria-hidden="true" />أختام ومكافآت تدعو للعودة</li><li><Check size={18} aria-hidden="true" />إدارة واضحة من لوحة واحدة</li></ul><Link href="/register" className={styles.goldButton}>ابدأ بناء علاقتك بعملائك <ArrowUpLeft size={20} aria-hidden="true" /></Link><small className={styles.packageNote}>الولاء والعروض متاحة ضمن الباقات التي تدعمها</small></div>
      <div data-reveal data-delay="2"><LoyaltyShowcase images={data.loyaltyImages} /></div>
    </div></section>

    <section className={`${styles.container} ${styles.experienceSection}`} aria-labelledby="experience-heading"><div data-reveal><span className={styles.eyebrow}>من لوحة واحدة</span><h2 id="experience-heading">{copy(data.settings.heroSideText)}</h2><p>أضف منتجاتك وحدّث تفاصيل علامتك وشارك منيوك المستقل مع عملائك</p><Link href="/register" className={styles.textLink}>أعطِ علامتك مساحتها <ArrowLeft size={19} aria-hidden="true" /></Link></div><div data-reveal data-delay="1">{data.heroImages.length ? <MediaGallery images={data.heroImages} active={active} interval={data.settings.carouselIntervalSeconds} /> : <div className={styles.workflow}>{setupSteps.map((step, index) => <div key={step.title}><span className={styles.stepNumber}>{index + 1}</span><div><strong>{step.title}</strong><p>{step.description}</p></div><step.icon size={23} aria-hidden="true" /></div>)}</div>}</div></section>

    {data.brands.length ? <section className={`${styles.container} ${styles.brandsSection}`} aria-labelledby="brands-heading"><div data-reveal><span className={styles.eyebrow}>لكل علامة حكاية</span><h2 id="brands-heading">علامات اختارت برندة</h2></div><div className={styles.brandGrid}>{data.brands.map(brand => { const content = <><MediaImage src={brand.logoUrl} alt={brand.name} /><strong>{brand.name}</strong>{brand.locationLabel ? <span>{brand.locationLabel}</span> : null}</>; return brand.href ? <Link href={brand.href} key={brand.id} className={styles.brandItem}>{content}</Link> : <div key={brand.id} className={styles.brandItem}>{content}</div>; })}</div></section> : null}

    {data.promotions.length ? <section className={`${styles.container} ${styles.promotions}`} aria-labelledby="promotions-heading"><div className={styles.sectionHeading} data-reveal><div><span className={styles.eyebrow}>من عالم علاماتنا</span><h2 id="promotions-heading">أشياء تستحق الاكتشاف</h2></div><div className={styles.rowControls}><button type="button" aria-label="الاختيارات السابقة" onClick={() => promotionRow.current?.scrollBy({ left: 340, behavior: active ? "smooth" : "instant" })}><ArrowRight size={20} aria-hidden="true" /></button><button type="button" aria-label="الاختيارات التالية" onClick={() => promotionRow.current?.scrollBy({ left: -340, behavior: active ? "smooth" : "instant" })}><ArrowLeft size={20} aria-hidden="true" /></button></div></div><div ref={promotionRow} className={styles.promotionRow} tabIndex={0} role="region" aria-label="اختيارات العلامات التجارية">{data.promotions.map((item, index) => <article key={`${item.itemType}-${item.id ?? item.itemId ?? index}`} className={styles.promotionCard}><div className={styles.promotionImage}><MediaImage src={item.imageUrl} alt={item.title} /><span>{item.badge || (item.itemType === "offer" ? "عرض خاص" : item.itemType === "product" ? "منتج مختار" : "علامة مختارة")}</span></div><div className={styles.promotionBody}><small>{item.brandName}</small><h3>{item.title}</h3>{item.subtitle ? <p>{item.subtitle}</p> : null}{item.locationLabel ? <span className={styles.location}><MapPin size={14} aria-hidden="true" />{item.locationLabel}</span> : null}<Link href={item.href}>اكتشف التفاصيل <ExternalLink size={17} aria-hidden="true" /></Link></div></article>)}</div></section> : null}

    <section id="about" className={`${styles.container} ${styles.about}`} aria-labelledby="about-heading"><div className={styles.aboutIntro} data-reveal><span className={styles.eyebrow}>برندة أقرب لطموحك</span><h2 id="about-heading">شريكك في التفاصيل<br />التي تصنع الفرق</h2><p>{copy(data.settings.aboutUs)}</p></div><div className={styles.aboutDetails}>{[["رؤيتنا", data.settings.vision], ["رسالتنا", data.settings.mission]].map(([title, body], index) => <article key={title} data-reveal data-delay={index}><span>{title}</span><p>{copy(body)}</p></article>)}</div></section>

    <section className={`${styles.container} ${styles.ctaSection}`}><div className={styles.cta} data-reveal><div><span className={styles.eyebrow}>الخطوة القادمة لعلامتك</span><h2>{copy(data.settings.ctaTitle)}</h2><p>{copy(data.settings.ctaDescription)}</p></div><div className={styles.ctaActions}><Link href="/register" className={styles.primaryButton}>ابدأ الآن مجانًا <ArrowUpLeft size={20} aria-hidden="true" /></Link><button type="button" className={styles.textLink} onClick={() => setContactOpen(true)}>خلّنا نتعرف على علامتك <MessageCircle size={19} aria-hidden="true" /></button></div><Sparkles className={styles.ctaDecoration} size={200} strokeWidth={.5} aria-hidden="true" /></div></section>

    <footer className={styles.footer}><div className={`${styles.container} ${styles.footerTop}`}><div><BarndaksaLogo variant="brown" width={124} height={50} /><p>علامتك تستحق تجربة تليق بها</p></div><nav aria-label="روابط المنصة"><Link href="/login">تسجيل الدخول</Link><Link href="/register">إنشاء حساب</Link><Link href="/careers">الوظائف</Link><button type="button" onClick={() => setContactOpen(true)}>تواصل معنا</button></nav><div className={styles.socials}>{[["instagram", "إنستغرام"], ["facebook", "فيسبوك"], ["tiktok", "تيك توك"], ["x", "إكس"]].map(([key, label]) => data.contacts[key as keyof typeof data.contacts] ? <a key={key} href={data.contacts[key as keyof typeof data.contacts]} target="_blank" rel="noopener noreferrer" aria-label={label}><Globe size={19} aria-hidden="true" /><span>{label}</span></a> : null)}<a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={19} aria-hidden="true" /><span>واتساب</span></a></div></div><div className={`${styles.container} ${styles.footerBottom}`}><span>© برندة جميع الحقوق محفوظة</span><button type="button" onClick={() => setPaused(current => !current)} aria-pressed={paused} className={styles.motionToggle}>{paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}{paused ? "تشغيل حركة الصفحة" : "إيقاف حركة الصفحة"}</button></div></footer>

    <HomeDialog open={videoOpen} onClose={closeVideo} title="تعرّف على برندة" wide>{videoOpen && data.introVideo ? <><video ref={video} src={`/api/public/platform-media/${encodeURIComponent(data.introVideo.id)}`} controls autoPlay playsInline preload="metadata" onError={() => setVideoError(true)} onPlay={() => { void recordIntroVideoEventAction("intro_video_view").catch(() => {}); }} />{videoError ? <p className={styles.error} role="alert">تعذر تشغيل الفيديو حاول فتحه مجددًا أو تواصل معنا</p> : null}</> : null}</HomeDialog>
    <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} contacts={data.contacts} />
  </main>;
}
