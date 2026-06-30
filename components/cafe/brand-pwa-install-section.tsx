"use client";

import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

type Props = {
  slug: string;
  cafeName: string;
  compact?: boolean;
};

function isStandaloneDisplay() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
}

export function BrandPwaInstallSection({ slug, cafeName, compact = false }: Props) {
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const installedKey = `barndaksa_pwa_installed_${slug}`;
    if (isStandaloneDisplay()) {
      setInstalled(true);
    }

    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = `/api/pwa/${encodeURIComponent(slug)}/manifest`;
    document.head.appendChild(manifest);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setMessage("");
      console.warn("[brand-pwa] beforeinstallprompt received");
    };

    const appInstalledHandler = () => {
      localStorage.setItem(installedKey, "1");
      setInstalled(true);
      setProgress(100);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", appInstalledHandler);

    if ("serviceWorker" in navigator) {
      const encodedSlug = encodeURIComponent(slug);
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((registration) => registration.scope.endsWith(`/c/${encodedSlug}/`))
            .map((registration) => registration.unregister()),
        );

        const registration = await navigator.serviceWorker.register(`/api/pwa/${encodedSlug}/sw`, {
          scope: `/c/`,
        });

        console.warn("[brand-pwa] sw registered", registration.scope);
        await registration.update();

        const refreshKey = `barndaksa_pwa_sw_refreshed_${encodedSlug}`;
        if (!sessionStorage.getItem(refreshKey)) {
          sessionStorage.setItem(refreshKey, "1");
          window.location.reload();
        }
      })();
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", appInstalledHandler);
      manifest.remove();
    };
  }, [slug]);

  async function install() {
    setProgress(65);
    console.warn("[brand-pwa] install clicked", { hasPrompt: Boolean(installPrompt) });
    const promptEvent = installPrompt as BeforeInstallPromptEvent | null;

    if (promptEvent?.prompt) {
      setMessage("");
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice?.catch(() => null);
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
    setMessage("في iPhone افتح المشاركة ثم اختر إضافة إلى الشاشة الرئيسية، وفي Chrome تأكد أن الصفحة مفتوحة من المتصفح وليست داخل تطبيق آخر");
  }

  if (installed) return null;

  if (compact) {
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
