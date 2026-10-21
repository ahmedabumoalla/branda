import Link from "next/link";
import { ArrowLeft, ScanLine } from "lucide-react";

/** Public failures deliberately contain no account or subscription details. */
export function PublicServiceUnavailable() {
  return (
    <main dir="rtl" lang="ar" className="flex min-h-dvh items-center justify-center bg-[#111310] px-6 py-12 text-center text-[#F3EEE3]">
      <section aria-labelledby="service-unavailable-title" className="flex w-full max-w-md flex-col items-center">
        <p className="mb-10 text-lg font-bold tracking-wide text-[#CFAB76]">برندة</p>
        <div aria-hidden="true" className="mb-7 flex size-20 items-center justify-center rounded-3xl border border-[#CFAB76]/30 bg-[#CFAB76]/5">
          <ScanLine size={32} strokeWidth={1.5} className="text-[#CFAB76]" />
        </div>
        <h1 id="service-unavailable-title" className="text-balance text-2xl font-bold leading-relaxed sm:text-3xl">عذرًا تعذر التحميل</h1>
        <Link href="/" className="mt-9 inline-flex min-h-12 max-w-full items-center justify-center gap-3 rounded-xl bg-[#CFAB76] px-6 py-3 font-bold text-[#111310] transition-colors hover:bg-[#DFC397] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#CFAB76] motion-reduce:transition-none">
          تصفح منتجات برندة
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
