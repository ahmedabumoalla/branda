"use client";

import { Download, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

declare global {
  interface Window {
    __barndaksaDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __barndaksaPwaInstallReady?: boolean;
  }
}

type Props = {
  slug: string;
  cafeName: string;
  compact?: boolean;
};

const ANDROID_CHROME_INSTALL_FALLBACK =
  "من قائمة Chrome اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية";

function detectInstallDevice() {
  const userAgent = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const touchPoints = window.navigator.maxTouchPoints || 0;
  const isIos =
    /iphone|ipad|ipod/i.test(userAgent) ||
    (platform === "MacIntel" && touchPoints > 1);

  return {
    isIos,
    isAndroidChrome: /android/i.test(userAgent) && /chrome|crios/i.test(userAgent),
  };
}

function isStandaloneDisplay() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ||
      document.referrer.startsWith("android-app://"),
  );
}

export function BrandPwaInstallSection({ slug, cafeName, compact = false }: Props) {
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isAndroidChrome, setIsAndroidChrome] = useState(false);

  useEffect(() => {
    const installedKey = `barndaksa_pwa_installed_${slug}`;
    const device = detectInstallDevice();
    setIsIos(device.isIos);
    setIsAndroidChrome(device.isAndroidChrome);

    if (localStorage.getItem(installedKey) === "1" || isStandaloneDisplay()) {
      setInstalled(true);
    }

    const manifestHref = `/api/pwa/${encodeURIComponent(slug)}/manifest`;
    let manifest = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]')).find(
      (link) => link.getAttribute("href") === manifestHref || link.href.includes(manifestHref),
    );
    if (!manifest) {
      manifest = document.createElement("link");
      manifest.rel = "manifest";
      manifest.href = manifestHref;
      document.head.appendChild(manifest);
    }

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`/api/pwa/${encodeURIComponent(slug)}/sw`, {
        scope: `/c/${encodeURIComponent(slug)}`,
      });
    }

    const syncInstallPrompt = () => {
      const promptEvent = window.__barndaksaDeferredInstallPrompt;
      if (promptEvent) {
        setMessage("");
      }
    };

    const appInstalledHandler = () => {
      localStorage.setItem(installedKey, "1");
      window.__barndaksaDeferredInstallPrompt = null;
      window.__barndaksaPwaInstallReady = false;
      setInstalled(true);
      setProgress(100);
      setMessage("");
    };

    syncInstallPrompt();
    const fallbackTimer = window.setTimeout(() => {
      if (device.isAndroidChrome && !window.__barndaksaDeferredInstallPrompt && !isStandaloneDisplay()) {
        setMessage(ANDROID_CHROME_INSTALL_FALLBACK);
      }
    }, 5000);

    window.addEventListener("barndaksa:pwa-install-ready", syncInstallPrompt);
    window.addEventListener("appinstalled", appInstalledHandler);
    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("barndaksa:pwa-install-ready", syncInstallPrompt);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, [slug]);

  async function install() {
    if (installing) return;
    if (isStandaloneDisplay()) {
      localStorage.setItem(`barndaksa_pwa_installed_${slug}`, "1");
      setInstalled(true);
      return;
    }

    const promptEvent = window.__barndaksaDeferredInstallPrompt;
    if (promptEvent) {
      setInstalling(true);
      setMessage("");
      setProgress(65);
      await promptEvent.prompt();
      let choice: { outcome: string } | null = null;
      try {
        choice = await promptEvent.userChoice;
      } catch {}
      setInstalling(false);

      if (choice?.outcome === "accepted") {
        window.__barndaksaDeferredInstallPrompt = null;
        window.__barndaksaPwaInstallReady = false;
        localStorage.setItem(`barndaksa_pwa_installed_${slug}`, "1");
        setInstalled(true);
        setProgress(100);
        return;
      }

      setProgress(90);
      setMessage("");
      return;
    }

    if (isIos) {
      setMessage("في iPhone افتح المشاركة ثم اختر إضافة إلى الشاشة الرئيسية");
      return;
    }

    if (isAndroidChrome) {
      setMessage((current) => (current === ANDROID_CHROME_INSTALL_FALLBACK ? current : ""));
      return;
    }

    setMessage("التثبيت غير متاح من المتصفح الحالي");
  }

  async function refreshPwa() {
    setRefreshing(true);
    setMessage("");

    const manifestHref = `/api/pwa/${encodeURIComponent(slug)}/manifest?refresh=${Date.now()}`;
    await fetch(manifestHref, { cache: "reload" }).catch(() => null);

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => registration.active?.scriptURL.includes(`/api/pwa/${encodeURIComponent(slug)}/sw`))
          .map((registration) => registration.update().catch(() => undefined)),
      );
      navigator.serviceWorker.controller?.postMessage({ type: "BARNDAKSA_PWA_REFRESH" });
    }

    setRefreshing(false);
    setMessage("تم طلب تحديث التطبيق، أعد فتحه لتحديث الاسم واللوجو");
  }

  if (installed) {
    return (
      <div dir="rtl" className="fixed left-3 top-3 z-50 flex max-w-[230px] flex-col items-start gap-2">
        <button
          type="button"
          onClick={() => void refreshPwa()}
          disabled={refreshing}
          aria-label="تحديث بيانات التطبيق"
          title="تحديث بيانات التطبيق"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ci-border,#E7D7C6)] bg-white/88 text-[var(--ci-primary-bg,#6B3A25)] shadow-[0_12px_30px_rgba(23,20,18,0.14)] backdrop-blur transition active:scale-95 disabled:cursor-wait disabled:opacity-80"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
        {message ? (
          <p className="rounded-2xl border border-[var(--ci-border,#E7D7C6)] bg-white/92 px-3 py-2 text-right text-[11px] font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)] shadow-sm backdrop-blur">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  if (isIos) {
    const iosMessage = 'في iPhone افتح المشاركة ثم اختر "إضافة إلى الشاشة الرئيسية"';
    if (compact) {
      return (
        <section dir="rtl" className="w-full">
          <div className="mx-auto max-w-[320px] rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-white/86 p-3 text-center text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)] shadow-[0_12px_34px_rgba(23,20,18,0.08)] backdrop-blur">
            {iosMessage}
          </div>
        </section>
      );
    }

    return (
      <section dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="rounded-[28px] border border-[var(--ci-border,#E7D7C6)] bg-white/86 p-5 text-center text-sm font-bold leading-7 text-[var(--ci-muted-fg,#806A5E)] shadow-[0_12px_34px_rgba(23,20,18,0.08)] backdrop-blur">
          {iosMessage}
        </div>
      </section>
    );
  }

  if (compact) {
    return (
      <section dir="rtl" className="w-full">
        <div className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void install()}
            disabled={installing}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-white/86 px-5 py-3 text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-coffee-brown))] shadow-[0_12px_34px_rgba(23,20,18,0.08)] backdrop-blur transition hover:-translate-y-0.5 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
          >
            <Download className="h-5 w-5" />
            حمل التطبيق
          </button>
          {message ? (
            <p className="max-w-xs text-center text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
              {message}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="barndaksa-premium-card overflow-hidden rounded-[32px] bg-gradient-to-br from-[var(--ci-primary-bg,var(--barndaksa-coffee-brown))] to-[var(--ci-secondary-bg,#17100d)] p-6 text-[var(--ci-button-fg,#FCF8F3)] shadow-xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]">تطبيق العلامة</p>
            <h2 className="mt-2 text-3xl font-black">حمّل تطبيق {cafeName}</h2>
            <p className="mt-3 max-w-xl font-bold leading-8 text-white/74">
              واجهة عميل أخف وأسرع للمنيو والعروض وبطاقة الولاء، تعمل من شاشة الجوال مباشرة
            </p>
          </div>
          <button
            type="button"
            onClick={() => void install()}
            disabled={installing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] px-6 py-4 font-black text-[var(--ci-accent-fg,var(--barndaksa-espresso-dark))] disabled:cursor-wait disabled:opacity-80"
          >
            <Download className="h-5 w-5" />
            حمل التطبيق
          </button>
        </div>
        {progress > 0 ? (
          <div className="mt-5 rounded-2xl bg-white/10 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-black text-white/74">
              <span>تجهيز التطبيق السريع</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
        {message ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 p-4 text-sm font-bold">
            <Smartphone className="h-5 w-5" />
            {message}
          </div>
        ) : null}
      </div>
    </section>
  );
}
