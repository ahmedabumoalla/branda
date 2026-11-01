"use client";

import { useParams } from "next/navigation";
import { LocoMenuLoading } from "@/components/menu/loco-menu-loading";
import { isLocoMenu } from "@/lib/menu/loco-brand";

export default function MenuLoading() {
  const { slug } = useParams<{ slug: string }>();
  if (isLocoMenu(slug)) return <LocoMenuLoading />;

  return <main dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f7f5ef] text-[#315e50]" aria-busy="true">
    <span className="text-5xl" aria-hidden="true">✦</span>
    <p role="status">نحضّر لك المنيو</p>
  </main>;
}
