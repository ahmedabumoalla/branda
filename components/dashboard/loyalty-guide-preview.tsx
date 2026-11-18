"use client";

import { useSyncExternalStore } from "react";
import { BookOpen, ExternalLink } from "lucide-react";

const wideScreen = "(min-width: 768px)";
function subscribe(listener: () => void) {
  const query = window.matchMedia(wideScreen);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const getSnapshot = () => window.matchMedia(wideScreen).matches;
const getServerSnapshot = () => false;

export function LoyaltyGuidePreview({ src }: { src: string }) {
  const embedded = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Mobile opens the original document in its native reader, without fetching
  // a second copy inside a narrow iframe or displaying a thumbnail sidebar.
  if (!embedded) return <div className="flex flex-col items-center gap-4 px-5 py-10 text-center">
    <BookOpen size={36} className="text-[#713D2A]" aria-hidden="true" />
    <h2 className="text-lg font-bold text-[#311912]">اقرأ الدليل بملء الشاشة</h2>
    <p className="max-w-sm text-sm leading-7 text-[#806A5E]">افتح الملف للتصفح والتكبير بسهولة على جهازك</p>
    <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#713D2A] px-5 py-3 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#713D2A]"><ExternalLink size={18} aria-hidden="true" />فتح الدليل في نافذة مستقلة</a>
  </div>;
  return <iframe id="loyalty-guide-preview" src={src} title="استعراض دليل نظام الولاء في برندة" className="block h-[72vh] min-h-[420px] w-full min-w-0 border-0" />;
}
