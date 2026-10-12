"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { LoaderCircle, Wallet } from "lucide-react";
import s from "./rast-loyalty.module.css";

export function WalletDownloadLink({ provider, cardCode }: { provider: "apple" | "google"; cardCode: string }) {
  const [phase, setPhase] = useState<"idle" | "opening" | "retry">("idle");
  const locked = useRef(false);
  useEffect(() => {
    if (phase !== "opening") return;
    const reset = () => { locked.current = false; setPhase("idle"); };
    const visible = () => { if (document.visibilityState === "visible") reset(); };
    // Native pass downloads do not expose a completion event to the page.
    // Offer a retry without claiming that the user saved the card.
    const timer = window.setTimeout(() => { locked.current = false; setPhase("retry"); }, 30000);
    window.addEventListener("pageshow", reset);
    window.addEventListener("focus", reset);
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(timer); window.removeEventListener("pageshow", reset); window.removeEventListener("focus", reset); document.removeEventListener("visibilitychange", visible); };
  }, [phase]);
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (locked.current) { event.preventDefault(); return; }
    locked.current = true; setPhase("opening");
    // Preserve the browser's native pkpass download / Google redirect.
  }
  return <a className={s.walletButton} href={`/api/wallet/${provider}/${encodeURIComponent(cardCode)}`}
    onClick={open} aria-disabled={phase === "opening" || undefined} aria-busy={phase === "opening"}>
    {phase === "opening" ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : <Wallet aria-hidden="true" />}
    <span><small role="status">{phase === "opening" ? "جار فتح المحفظة" : phase === "retry" ? "لم تفتح؟ حاول مجددًا" : "إضافة إلى"}</small><strong dir="ltr">{provider === "apple" ? "Apple Wallet" : "Google Wallet"}</strong></span>
  </a>;
}
