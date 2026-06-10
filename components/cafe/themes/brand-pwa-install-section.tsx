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
      void navigator.serviceWorker.register(`/api/pwa/${encodeURIComponent(slug)}/sw`);
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
      setMessage("في Android يتم تثبيته كاختصار على الشاشة الرئيسية");
      return;
    }

    setMessage("في iPhone افتح زر المشاركة ثم اختر إضافة إلى الشاشة الرئيسية");
  }

  return (
    <section dir="rtl" className="mt-6">
      <div className="overflow-hidden rounded-[32px] bg-gradient-to-br from-[#4A281D] to-[#17100d] p-5 text-[#FCF8F3] shadow-xl">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-[#D9A33F] text-[#311912]">
            <Smartphone className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-[#D9A33F]">تطبيق العلامة</p>
            <h2 className="mt-1 text-xl font-black">اختصار {cafeName}</h2>
            <p className="mt-1 text-xs font-bold leading-5 text-[#E7D7C6]">
              Android يثبت مباشرة و iPhone من المشاركة ثم إضافة للشاشة الرئيسية
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={install}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D9A33F] px-5 py-3 font-black text-[#311912]"
        >
          <Download className="h-5 w-5" />
          تحميل التطبيق
        </button>

        {message ? (
          <div className="mt-3 rounded-2xl bg-white/10 p-3 text-xs font-bold leading-6">
            {message}
          </div>
        ) : null}
      </div>
    </section>
  );
}
