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

  useEffect(() => {
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

    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      manifest.remove();
    };
  }, [slug]);

  async function install() {
    const promptEvent = installPrompt as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: string }>;
    };

    if (promptEvent?.prompt) {
      await promptEvent.prompt();
      setMessage("إذا لم يظهر التثبيت استخدم إضافة إلى الشاشة الرئيسية من المتصفح");
      return;
    }

    setMessage("في iPhone افتح المشاركة ثم اختر إضافة إلى الشاشة الرئيسية");
  }

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
