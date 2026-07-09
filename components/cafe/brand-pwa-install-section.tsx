"use client";

import { Download, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { recordPwaInstallClickAction } from "@/app/actions/operation-events";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

type PwaInstallWindow = Window & {
  __barndaksaPwaInstallPromptEvent?: BeforeInstallPromptEvent | null;
  __barndaksaPwaInstallPromptSeen?: boolean;
};

type Props = {
  slug: string;
  cafeName: string;
  compact?: boolean;
  variant?: "section" | "compact" | "icon";
};

function isStandaloneDisplay() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
}

function getSavedInstallPrompt() {
  const saved = (window as PwaInstallWindow).__barndaksaPwaInstallPromptEvent;
  return saved?.prompt ? saved : null;
}

function brandScope(encodedSlug: string) {
  return `/c/${encodedSlug}`;
}

function ensureBrandManifest(slug: string) {
  const href = `/api/pwa/${encodeURIComponent(slug)}/manifest.json`;
  const existing = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');

  if (existing) {
    existing.href = href;
    existing.setAttribute("data-brand-pwa-manifest", "true");
    console.warn("[brand-pwa] manifest linked", existing.href);
    return existing;
  }

  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = href;
  manifest.setAttribute("data-brand-pwa-manifest", "true");
  document.head.appendChild(manifest);
  console.warn("[brand-pwa] manifest linked", manifest.href);
  return manifest;
}

export function BrandPwaInstallSection({ slug, cafeName, compact = false, variant = "section" }: Props) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const installedKey = `barndaksa_pwa_installed_${slug}`;
    if (isStandaloneDisplay()) {
      setInstalled(true);
    }

    ensureBrandManifest(slug);

    const syncSavedPrompt = () => {
      const saved = getSavedInstallPrompt();
      if (saved) {
        setInstallPrompt(saved);
        setMessage("");
        console.warn("[brand-pwa] saved beforeinstallprompt loaded");
      }
    };

    const handler = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      (window as PwaInstallWindow).__barndaksaPwaInstallPromptEvent = promptEvent;
      (window as PwaInstallWindow).__barndaksaPwaInstallPromptSeen = true;
      setInstallPrompt(promptEvent);
      setMessage("");
      console.warn("[brand-pwa] beforeinstallprompt received");
    };

    const appInstalledHandler = () => {
      localStorage.setItem(installedKey, "1");
      (window as PwaInstallWindow).__barndaksaPwaInstallPromptEvent = null;
      setInstalled(true);
      setProgress(100);
    };

    syncSavedPrompt();
    const syncTimer = window.setTimeout(syncSavedPrompt, 1200);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("barndaksa:beforeinstallprompt", syncSavedPrompt);
    window.addEventListener("appinstalled", appInstalledHandler);

    if ("serviceWorker" in navigator) {
      const encodedSlug = encodeURIComponent(slug);
      const currentScope = brandScope(encodedSlug);
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((registration) => {
              const scopePath = new URL(registration.scope).pathname.replace(/\/$/, "");
              return scopePath === "/c" || scopePath === `${currentScope}/` || scopePath === `${currentScope}`;
            })
            .map((registration) => registration.unregister()),
        );

        const registration = await navigator.serviceWorker.register(`/api/pwa/${encodedSlug}/sw`, {
          scope: currentScope,
        });

        console.warn("[brand-pwa] sw registered", registration.scope);
        await registration.update();

        const refreshKey = `barndaksa_pwa_sw_refreshed_brand_scope_v1_${encodedSlug}`;
        if (!sessionStorage.getItem(refreshKey)) {
          sessionStorage.setItem(refreshKey, "1");
          window.location.reload();
        }
      })();
    }

    return () => {
      window.clearTimeout(syncTimer);
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("barndaksa:beforeinstallprompt", syncSavedPrompt);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, [slug]);

  const install = useCallback(async () => {
    setProgress(65);
    ensureBrandManifest(slug);
    const promptEvent = installPrompt ?? getSavedInstallPrompt();
    console.warn("[brand-pwa] install clicked", { hasPrompt: Boolean(promptEvent) });
    await recordPwaInstallClickAction({
      cafeSlug: slug,
      path: window.location.pathname,
      hasPrompt: Boolean(promptEvent),
    }).catch((error) => console.warn("[brand-pwa] install click tracking skipped", error));

    if (promptEvent?.prompt) {
      setMessage("");
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice?.catch(() => null);
      (window as PwaInstallWindow).__barndaksaPwaInstallPromptEvent = null;
      setInstallPrompt(null);
      if (choice?.outcome === "accepted") {
        localStorage.setItem(`barndaksa_pwa_installed_${slug}`, "1");
        setInstalled(true);
        setProgress(100);
        return;
      }
      setProgress(90);
      setMessage("إذا لم يظهر التثبيت استخدم إضافة إلى الشاشة الرئيسية من المتصفح");
      return;
    }

    setProgress(90);
    setMessage("في Chrome على الجوال افتح القائمة واختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية، وإذا كان تطبيق علامة أخرى مثبتًا احذفه أولًا ثم أعد فتح الصفحة");
  }, [installPrompt, slug]);

  if (installed) return null;

  if (variant === "icon") {
    return (
      <div dir="rtl" className="relative shrink-0">
        <button
          type="button"
          onClick={install}
          aria-label="تحميل تطبيق العلامة"
          title="تحميل تطبيق العلامة"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-black/5 bg-white text-[var(--ci-primary-bg,var(--barndaksa-coffee-brown))] shadow-sm transition active:scale-95"
        >
          <Download className="h-5 w-5" />
        </button>
        {message ? (
          <p className="absolute left-0 top-14 z-30 w-64 rounded-2xl border border-[var(--ci-border,#E7D7C6)] bg-white p-3 text-right text-xs font-bold leading-5 text-[var(--ci-muted-fg,#806A5E)] shadow-[0_12px_34px_rgba(23,20,18,0.12)]">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  if (compact || variant === "compact") {
    return (
      <section dir="rtl" className="w-full">
        <div className="mx-auto flex w-full max-w-[320px] flex-col items-center gap-2">
          <button
            type="button"
            onClick={install}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-white/86 px-5 py-3 text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-coffee-brown))] shadow-[0_12px_34px_rgba(23,20,18,0.08)] backdrop-blur transition hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <Download className="h-5 w-5" />
            حمل التطبيق لتجربة أكثر جمالية
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
            onClick={install}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] px-6 py-4 font-black text-[var(--ci-accent-fg,var(--barndaksa-espresso-dark))]"
          >
            <Download className="h-5 w-5" />
            تحميل التطبيق السريع
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
