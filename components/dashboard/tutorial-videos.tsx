"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, PlayCircle, ScanLine, Settings2, Smartphone, X } from "lucide-react";

/** The three short tutorials that used to be sent over WhatsApp after registration. They now live here, where the
 * owner lands after creating the account and can return any time (user decision 2026-11-22). */
export const tutorialVideos = [
  { id: "setup", icon: Settings2, title: "كيف تضبط حسابك", text: "إعداد برنامج الولاء وبطاقتك من البداية", src: "/guides/owner-loyalty-setup-20261118.mp4" },
  { id: "cashier", icon: ScanLine, title: "كيف يسجل الموظف الختم", text: "دخول الكاشير وتسجيل الأختام وصرف المكافآت", src: "/guides/cashier-loyalty-20261118.mp4" },
  { id: "customer", icon: Smartphone, title: "كيف يحمل العميل البطاقة", text: "التسجيل وإضافة البطاقة إلى محفظة الجوال", src: "/guides/customer-loyalty-card-20261119.mp4" },
] as const;

type Tutorial = (typeof tutorialVideos)[number];

export function TutorialVideos({ welcome = false }: { welcome?: boolean }) {
  const [open, setOpen] = useState<Tutorial | null>(null);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-[#E7D7C6] bg-white p-5 sm:p-6">
      <header className="mb-5">
        {welcome && <p className="mb-2 text-sm font-bold text-[#713D2A]">أهلًا بك في برندة</p>}
        <h2 id={headingId} className="text-xl font-bold text-[#311912]">{welcome ? "ابدأ بهذه المقاطع الثلاثة" : "ابدأ من هنا"}</h2>
        <p className="mt-2 text-sm leading-7 text-[#806A5E]">ثلاثة مقاطع قصيرة تغطي إعداد حسابك وعمل الموظف وتجربة العميل</p>
      </header>
      <ol className="grid gap-4 md:grid-cols-3">
        {tutorialVideos.map((tutorial, index) => (
          <li key={tutorial.id}>
            <button type="button" onClick={() => setOpen(tutorial)} aria-haspopup="dialog"
              className="group flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-[#E7D7C6] bg-[#FBF7F2] p-5 text-right transition hover:border-[#713D2A] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#713D2A]">
              <span className="flex w-full items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#713D2A] text-white"><tutorial.icon size={24} aria-hidden="true" /></span>
                <span className="text-sm font-bold text-[#B39A89]">{index + 1} من 3</span>
              </span>
              <span className="text-base font-bold text-[#311912]">{tutorial.title}</span>
              <span className="text-sm leading-7 text-[#806A5E]">{tutorial.text}</span>
              <span className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-[#713D2A]"><PlayCircle size={18} aria-hidden="true" />شاهد المقطع</span>
            </button>
          </li>
        ))}
      </ol>
      {open && <TutorialDialog key={open.id} tutorial={open} close={() => setOpen(null)} />}
    </section>
  );
}

function TutorialDialog({ tutorial, close }: { tutorial: Tutorial; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = dialog.current;
    const player = video.current;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => {
      player?.pause();
      node?.close();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} dir="rtl" aria-labelledby={titleId}
      className="m-auto w-[min(880px,calc(100vw-24px))] max-w-none rounded-2xl border border-[#E7D7C6] bg-white p-0 text-right backdrop:bg-[#1c0f0a]/70"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="p-4 sm:p-5">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-[#311912]">{tutorial.title}</h2>
          <button type="button" onClick={close} aria-label="إغلاق المقطع" autoFocus
            className="grid h-11 w-11 place-items-center rounded-xl border border-[#E7D7C6] text-[#311912] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#713D2A]"><X size={20} aria-hidden="true" /></button>
        </header>
        <video ref={video} src={tutorial.src} controls playsInline preload="metadata" aria-label={tutorial.text}
          className="block max-h-[70vh] w-full rounded-xl bg-black" onError={() => setFailed(true)} />
        {failed && <p role="alert" className="mt-3 text-sm text-[#970e29]">تعذر تشغيل المقطع افتحه من الرابط أدناه</p>}
        <a href={tutorial.src} target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#713D2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#713D2A]">
          <ExternalLink size={16} aria-hidden="true" />فتح المقطع في نافذة مستقلة
        </a>
      </div>
    </dialog>
  );
}
