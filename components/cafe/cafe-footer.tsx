"use client";

import Link from "next/link";
import Image from "next/image";
import { LOGO } from "@/lib/ui/brand";
import { getThemeClasses, type CafeThemeId } from "@/lib/mock/cafe-theme";

type Props = {
  slug: string;
  cafeName: string;
  themeId?: CafeThemeId;
};

export function CafeFooter({ slug, cafeName, themeId = "soft-cream-3d" }: Props) {
  const theme = getThemeClasses(themeId);
  const isDark = themeId === "cyber-eco-dark" || themeId === "luxury-boutique";
  const logoSrc = isDark ? LOGO.dark : LOGO.brown;

  return (
    <footer className={`mt-12 border-t pt-8 ${theme.footer}`}>
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-5 pb-8">
        <p className={`text-center text-sm font-black ${theme.accent}`}>{cafeName}</p>

        <nav className={`flex flex-wrap items-center justify-center gap-4 text-sm font-bold ${theme.muted}`}>
          <Link href={`/c/${slug}/products/popular`} className={`transition hover:opacity-80 ${theme.link}`}>
            المنيو
          </Link>
          <Link href={`/c/${slug}/reserve`} className={`transition hover:opacity-80 ${theme.link}`}>
            الحجز
          </Link>
          <Link href={`/c/${slug}/products/branches`} className={`transition hover:opacity-80 ${theme.link}`}>
            الفروع
          </Link>
          <Link href={`/c/${slug}/account`} className={`transition hover:opacity-80 ${theme.link}`}>
            الحساب
          </Link>
        </nav>

        <div className={`flex items-center gap-2 rounded-full border px-4 py-2 ${theme.card}`}>
          <span className="text-[11px] font-bold tracking-wide opacity-80">صُمم بواسطة برندة</span>
          <span className="text-[10px] font-medium opacity-50" aria-hidden>
            ·
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
            Powered by Branda
          </span>
          <Image
            src={logoSrc}
            alt="برندة"
            width={52}
            height={20}
            className="object-contain opacity-70"
          />
        </div>
      </div>
    </footer>
  );
}
