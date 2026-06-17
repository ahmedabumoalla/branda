"use client";

import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  slug: string;
  cafeName: string;
};

export function BrandPwaInstallSection({ slug, cafeName }: Props) {
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const installedKey = `barndaksa_pwa_installed_${slug}`;
    const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
    const navigatorStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    if (localStorage.getItem(installedKey) === "1" || mediaStandalone || navigatorStandalone) {
      setInstalled(true);
    }

    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = `/api/pwa/${encodeURIComponent(slug)}/manifest`;
    document.head.appendChild(manifest);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`/api/pwa/${encodeURIComponent(slug)}/sw`, {
        scope: `/app/${encodeURIComponent(slug)}/`,
      });
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const appInstalledHandler = () => {
      localStorage.setItem(installedKey, "1");
      setInstalled(true);
      setProgress(100);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", appInstalledHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", appInstalledHandler);
      manifest.remove();
    };
  }, [slug]);

  async function install() {
    setProgress(15);
    window.setTimeout(() => setProgress((current) => Math.max(current, 45)), 150);
    window.setTimeout(() => setProgress((current) => Math.max(current, 75)), 450);
    const promptEvent = installPrompt as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: string }>;
    };

    if (promptEvent?.prompt) {
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
    setMessage("في iPhone افتح المشاركة ثم اختر إضافة إلى الشاشة الرئيسية");
  }

  if (installed) return null;

  return (
    <section dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="overflow-hidden rounded-[32px] bg-gradient-to-br from-[#4A281D] to-[#17100d] p-6 text-[#FCF8F3] shadow-xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-black text-[#D9A33F]">تطبيق العلامة</p>
            <h2 className="mt-2 text-3xl font-black">حمّل تطبيق {cafeName}</h2>
            <p className="mt-3 max-w-xl font-bold leading-8 text-[#E7D7C6]">
              واجهة عميل أخف وأسرع للمنيو والعروض وبطاقة الولاء، تعمل من شاشة الجوال مباشرة
            </p>
          </div>
          <button
            type="button"
            onClick={install}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D9A33F] px-6 py-4 font-black text-[#311912]"
          >
            <Download className="h-5 w-5" />
            تحميل التطبيق السريع
          </button>
        </div>
        {progress > 0 ? (
          <div className="mt-5 rounded-2xl bg-white/10 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-black text-[#E7D7C6]">
              <span>تجهيز التطبيق السريع</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-[#D9A33F] transition-all duration-500" style={{ width: `${progress}%` }} />
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
