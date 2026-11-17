"use client";

import { useSyncExternalStore } from "react";
import { aldeemLocationEvent, writeAldeemLocation } from "@/lib/aldeem/location";

function subscribe(onChange: () => void) {
  window.addEventListener(aldeemLocationEvent, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(aldeemLocationEvent, onChange);
    window.removeEventListener("popstate", onChange);
  };
}
const clientSnapshot = () => window.location.search;
const serverSnapshot = () => null;

export function useAldeemLocation<T extends string>(key: string, fallback: T, choices: readonly T[]) {
  const search = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const raw = search === null ? null : new URLSearchParams(search).get(`aldeem.${key}`);
  const value = raw !== null && choices.includes(raw as T) ? raw as T : fallback;
  return [value, (next: T) => { if (choices.includes(next)) writeAldeemLocation(key, next); }, search !== null] as const;
}
