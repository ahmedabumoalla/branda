"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LoyaltyLanguage } from "@/lib/loyalty/customer-language";
import s from "./rast-loyalty.module.css";

export function LoyaltyLanguageLink({ language }: { language: LoyaltyLanguage }) {
  const path = usePathname();
  const query = new URLSearchParams(useSearchParams().toString());
  const next = language === "en" ? "ar" : "en";
  query.set("lang", next);
  return <Link href={path + "?" + query} scroll={false} prefetch={false} lang={next} hrefLang={next} className={s.menuLink}>{next === "en" ? "English" : "العربية"}</Link>;
}
