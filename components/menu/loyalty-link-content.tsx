"use client";

import { useLinkStatus } from "next/link";
import { ArrowUpLeft, Gift, LoaderCircle } from "lucide-react";
import s from "./loyalty-navigation.module.css";

/** Follows the router lifecycle, including cancelled and superseded navigation. */
export function LoyaltyLinkContent({ className, service = false }: { className?: string; service?: boolean }) {
  const { pending } = useLinkStatus();
  const icon = pending ? <LoaderCircle className={s.spinner} aria-hidden="true" />
    : service ? <Gift aria-hidden="true" /> : <ArrowUpLeft aria-hidden="true" />;
  if (service) return <>{icon}<span>الولاء والمكافآت<small role="status">{pending ? "جار فتح بطاقتك" : "بطاقتك ومكافآتك من هنا"}</small></span></>;
  return <span className={className} data-pending={pending || undefined}>
    <span className={s.label} role="status">{pending ? "جار فتح بطاقتك" : "حمّل بطاقتك"}</span>{icon}
  </span>;
}
