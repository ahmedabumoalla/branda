"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  sidebar: ReactNode | ((close: () => void) => ReactNode);
  mobileTitle?: string;
  variant?: "dashboard" | "admin";
};

export function ResponsiveAppShell({
  children,
  sidebar,
  mobileTitle = "برندة",
  variant = "dashboard",
}: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const headerClass =
    variant === "admin"
      ? "border-white/10 bg-[#0f0c0a] text-[#F8E8D2]"
      : "border-[#E5D8CD]/60 bg-[#3A2117] text-[#F8E8D2]";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b px-4 lg:hidden ${headerClass}`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"
          aria-label="فتح القائمة"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate px-3 text-center text-sm font-black">
          {mobileTitle}
        </span>
        <span className="w-10" aria-hidden />
      </header>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px] lg:hidden"
          aria-label="إغلاق القائمة"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div
        className={`fixed right-0 top-0 z-[60] h-[100dvh] w-[min(280px,88vw)] transition-transform duration-300 ease-out lg:w-[280px] lg:!translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute left-3 top-3 z-[70] flex h-9 w-9 items-center justify-center rounded-lg bg-black/40 text-white lg:hidden"
          aria-label="إغلاق"
        >
          <X className="h-5 w-5" />
        </button>
        {typeof sidebar === "function" ? sidebar(() => setOpen(false)) : sidebar}
      </div>

      <section className="min-h-[100dvh] min-w-0 overflow-x-hidden pt-14 lg:mr-[280px] lg:pt-0">
        {children}
      </section>
    </>
  );
}
