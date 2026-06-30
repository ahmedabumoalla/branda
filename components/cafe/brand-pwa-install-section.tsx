"use client";

import { Download, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt?: () => Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
};

declare global {
  interface Window {
    __barndaksaPwaInstallCaptureReady?: boolean;
    __barndaksaPwaInstallPromptEvent?: BeforeInstallPromptEvent | null;
    __barndaksaPwaInstallPromptSeen?: boolean;
  }
}

type InstallDevice = "unknown" | "ios" | "android-chrome" | "other";
type InstallStage = "idle" | "preparing" | "opening" | "waiting" | "done";

type Props = {
  slug: string;
  cafeName: string;
  compact?: boolean;
};

const INSTALL_STAGE_TEXT: Record<InstallStage, string> = {
  idle: "",
  preparing: "جاري تجهيز التطبيق",
  opening: "فتح نافذة التثبيت",
  waiting: "بانتظار تأكيدك",
  done: "تم تجهيز التطبيق",
};
const ANDROID_CHROME_INSTALL_FALLBACK =
  "من قائمة Chrome ⋮ اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية";
const IOS_INSTALL_FALLBACK =
  'اضغط مشاركة ثم اختر "إضافة إلى الشاشة الرئيسية".';
const GENERIC_INSTALL_FALLBACK =
  "افتح قائمة المتصفح ثم اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية";

function installedStorageKey(slug: string) {
  return `barndaksa_pwa_installed_${slug}`;
}

function pwaManifestHref(slug: string, refresh = false) {
  const base = `/api/pwa/${encodeURIComponent(slug)}/manifest`;
  return refresh ? `${base}?refresh=${Date.now()}` : base;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function debugPwa(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[branda-pwa]", ...args);
  }
}

function getCapturedInstallPrompt() {
  const event = window.__barndaksaPwaInstallPromptEvent;
  return event?.prompt ? event : null;
}

function clearCapturedInstallPrompt() {
  window.__barndaksaPwaInstallPromptEvent = null;
}

function detectInstallDevice(): InstallDevice {
  const userAgent = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const touchPoints = window.navigator.maxTouchPoints || 0;
  const isIos =
    /iphone|ipad|ipod/i.test(userAgent) ||
    (platform === "MacIntel" && touchPoints > 1);

  if (isIos) return "ios";
  if (/android/i.test(userAgent) && /chrome|crios/i.test(userAgent)) {
    return "android-chrome";
  }
  return "other";
}

function isStandaloneDisplay() {
  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const navigatorStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  const androidAppReferrer = document.referrer.startsWith("android-app://");
  return Boolean(mediaStandalone || navigatorStandalone || androidAppReferrer);
}

function findManifestLink(slug: string) {
  const expectedHref = pwaManifestHref(slug);
  return Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]')).find(
    (link) => link.getAttribute("href") === expectedHref || link.href.includes(expectedHref),
  );
}

function ensureManifestLink(slug: string, refresh = false) {
  const href = pwaManifestHref(slug, refresh);
  let manifest = findManifestLink(slug);

  if (!manifest) {
    manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.dataset.barndaksaPwa = slug;
    document.head.appendChild(manifest);
  }

  manifest.href = href;
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="manifest"]')
    .forEach((link) => {
      if (link.href.includes(`/api/pwa/${encodeURIComponent(slug)}/manifest`)) {
        link.href = href;
      }
    });
  debugPwa("manifest link present", Boolean(manifest), href);

  return { href, manifest };
}

async function registerCafeServiceWorker(slug: string) {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.register(`/api/pwa/${encodeURIComponent(slug)}/sw`, {
    scope: `/c/${encodeURIComponent(slug)}`,
  });
  debugPwa("service worker registered", registration.scope);
  return registration;
}

async function refreshCafePwa(slug: string) {
  const { href } = ensureManifestLink(slug, true);
  await fetch(href, { cache: "reload" }).catch(() => null);

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => {
          const encodedSlug = encodeURIComponent(slug);
          return (
            registration.scope.includes(`/c/${encodedSlug}`) ||
            registration.scope.includes(`/app/${encodedSlug}`) ||
            registration.active?.scriptURL.includes(`/api/pwa/${encodedSlug}/sw`)
          );
        })
        .map((registration) => registration.update().catch(() => undefined)),
    );
    navigator.serviceWorker.controller?.postMessage({ type: "BARNDAKSA_PWA_REFRESH" });
  }

  if ("caches" in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(
      keys
        .filter((key) => key.startsWith(`barndaksa-customer-${encodeURIComponent(slug)}`))
        .map((key) => caches.delete(key).catch(() => false)),
    );
  }
}

function PwaFloatingAction({
  mode,
  busy,
  message,
  onClick,
}: {
  mode: "install" | "refresh";
  busy: boolean;
  message: string;
  onClick: () => void;
}) {
  const Icon = mode === "install" ? Download : RefreshCw;
  const label = mode === "install" ? "إعادة محاولة تثبيت التطبيق" : "تحديث بيانات التطبيق";

  return (
    <div dir="rtl" className="fixed left-3 top-3 z-50 flex max-w-[230px] flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ci-border,#E7D7C6)] bg-white/88 text-[var(--ci-primary-bg,#6B3A25)] shadow-[0_12px_30px_rgba(23,20,18,0.14)] backdrop-blur transition hover:-translate-y-0.5 active:scale-95"
      >
        <Icon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      </button>
      {message ? (
        <p className="rounded-2xl border border-[var(--ci-border,#E7D7C6)] bg-white/92 px-3 py-2 text-right text-[11px] font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)] shadow-sm backdrop-blur">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function InstallProgress({ progress, stage }: { progress: number; stage: InstallStage }) {
  if (progress <= 0 || stage === "idle") return null;

  return (
    <div className="mt-4 rounded-2xl bg-white/10 p-3">
      <div className="mb-2 flex items-center justify-between text-xs font-black text-current/75">
        <span>{INSTALL_STAGE_TEXT[stage]}</span>
        <span>{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-current/15">
        <div
          className="h-full rounded-full bg-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function IosInstallInstructions({ compact }: { compact: boolean }) {
  const content = (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ci-button-bg,#6B3A25)]/10 text-[var(--ci-button-bg,#6B3A25)]">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 text-right">
          <p className="text-sm font-black text-[var(--ci-page-fg,#171412)]">تثبيت التطبيق على iPhone</p>
          <p className="mt-1 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)]">
            اضغط مشاركة ثم اختر "إضافة إلى الشاشة الرئيسية".
          </p>
        </div>
      </div>
    </>
  );

  if (compact) {
    return (
      <section dir="rtl" className="w-full">
        <div className="mx-auto w-full max-w-[320px] rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-white/86 p-3 shadow-[0_12px_34px_rgba(23,20,18,0.08)] backdrop-blur">
          {content}
        </div>
      </section>
    );
  }

  return (
    <section dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="rounded-[28px] border border-[var(--ci-border,#E7D7C6)] bg-white/86 p-5 shadow-[0_12px_34px_rgba(23,20,18,0.08)] backdrop-blur">
        {content}
      </div>
    </section>
  );
}

export function BrandPwaInstallSection({ slug, cafeName, compact = false }: Props) {
  const [device, setDevice] = useState<InstallDevice>("unknown");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [installUnavailable, setInstallUnavailable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<InstallStage>("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const installedKey = installedStorageKey(slug);
    const nextDevice = detectInstallDevice();
    const standalone = isStandaloneDisplay();
    const capturedPrompt = getCapturedInstallPrompt();

    setDevice(nextDevice);
    setInstallPrompt(capturedPrompt);
    setInstallUnavailable(false);
    debugPwa("manifest link present", Boolean(findManifestLink(slug)), pwaManifestHref(slug));
    debugPwa("beforeinstallprompt ready", Boolean(capturedPrompt), "seen", Boolean(window.__barndaksaPwaInstallPromptSeen));
    debugPwa("display-mode standalone", standalone);

    if (localStorage.getItem(installedKey) === "1" || standalone) {
      setInstalled(true);
    }

    ensureManifestLink(slug);
    void registerCafeServiceWorker(slug).catch((error) => {
      debugPwa("service worker registration failed", error);
    });

    const handler = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__barndaksaPwaInstallPromptEvent = promptEvent;
      window.__barndaksaPwaInstallPromptSeen = true;
      setInstallPrompt(promptEvent);
      setInstallDismissed(false);
      setInstallUnavailable(false);
      setMessage("");
      debugPwa("beforeinstallprompt received");
    };

    const capturedHandler = () => {
      const promptEvent = getCapturedInstallPrompt();
      setInstallPrompt(promptEvent);
      if (promptEvent) {
        setInstallDismissed(false);
        setInstallUnavailable(false);
        setMessage("");
      }
      debugPwa("beforeinstallprompt captured sync", Boolean(promptEvent));
    };

    const appInstalledHandler = () => {
      localStorage.setItem(installedKey, "1");
      setInstalled(true);
      setInstallPrompt(null);
      clearCapturedInstallPrompt();
      setInstallDismissed(false);
      setInstallUnavailable(false);
      setStage("done");
      setProgress(100);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("barndaksa:beforeinstallprompt", capturedHandler);
    window.addEventListener("appinstalled", appInstalledHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("barndaksa:beforeinstallprompt", capturedHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, [slug]);

  async function install() {
    if (installing) return;
    if (isStandaloneDisplay()) {
      localStorage.setItem(installedStorageKey(slug), "1");
      setInstalled(true);
      return;
    }

    const promptEvent = installPrompt?.prompt ? installPrompt : getCapturedInstallPrompt();
    if (promptEvent) {
      setInstallPrompt(promptEvent);
    }

    setInstalling(true);
    setMessage("");
    setInstallUnavailable(false);
    setStage("preparing");
    setProgress(0);
    await wait(120);
    setProgress(25);
    await wait(160);

    if (!promptEvent?.prompt) {
      setInstalling(false);
      setStage("idle");
      setProgress(0);
      setInstallUnavailable(true);
      setMessage(device === "ios" ? IOS_INSTALL_FALLBACK : device === "android-chrome" ? ANDROID_CHROME_INSTALL_FALLBACK : GENERIC_INSTALL_FALLBACK);
      debugPwa("beforeinstallprompt unavailable on click", device);
      return;
    }

    setStage("opening");
    setProgress(50);
    await promptEvent.prompt();
    setStage("waiting");
    setProgress(75);

    const choice = await promptEvent.userChoice?.catch(() => null);
    setInstallPrompt(null);
    clearCapturedInstallPrompt();

    if (choice?.outcome === "accepted") {
      localStorage.setItem(installedStorageKey(slug), "1");
      setStage("done");
      setProgress(100);
      setMessage("تم تجهيز التطبيق");
      setInstalled(true);
      setInstallUnavailable(false);
      setInstalling(false);
      return;
    }

    setInstalling(false);
    setInstallDismissed(true);
    setInstallUnavailable(false);
    setStage("idle");
    setProgress(0);
    setMessage("لم يتم التثبيت. يمكنك المحاولة مرة أخرى.");
  }

  async function refreshPwa() {
    setRefreshing(true);
    setMessage("");
    await refreshCafePwa(slug);
    setMessage("تم طلب تحديث التطبيق، أعد فتحه لتحديث الاسم واللوجو");
    setRefreshing(false);
  }

  if (device === "unknown") return null;

  if (installed) {
    return (
      <PwaFloatingAction
        mode="refresh"
        busy={refreshing}
        message={message}
        onClick={() => void refreshPwa()}
      />
    );
  }

  if (device === "ios") {
    return <IosInstallInstructions compact={compact} />;
  }

  const installButtonLabel =
    installUnavailable || installDismissed ? "حاول مرة أخرى" : "حمل التطبيق لتجربة أكثر جمالية";
  const wideInstallButtonLabel =
    installUnavailable || installDismissed ? "حاول مرة أخرى" : "تحميل التطبيق السريع";

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
            {installButtonLabel}
          </button>
          <InstallProgress progress={progress} stage={stage} />
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
            <h2 className="mt-2 text-3xl font-black">حمل تطبيق {cafeName}</h2>
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
            {wideInstallButtonLabel}
          </button>
        </div>
        <InstallProgress progress={progress} stage={stage} />
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
