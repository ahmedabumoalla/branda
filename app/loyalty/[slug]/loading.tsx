"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { loyaltyLanguage } from "@/lib/loyalty/customer-language";
import s from "@/components/menu/loyalty-navigation.module.css";

function LoadingMessage() {
  const language = loyaltyLanguage(useSearchParams().get("lang"));
  const en = language === "en";
  return <div lang={language} dir={en ? "ltr" : "rtl"}>
    <p>{en ? "Opening your loyalty card" : "جار فتح بطاقتك"}</p>
    <small>{en ? "Your card will be ready in a moment" : "لحظات وتكون بطاقتك بين يديك"}</small>
  </div>;
}

export default function Loading() {
  return <main className={s.loading} role="status" aria-live="polite">
    <LoaderCircle className={s.spinner} aria-hidden="true" />
    <Suspense fallback={null}><LoadingMessage /></Suspense>
  </main>;
}
