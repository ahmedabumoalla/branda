"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMindFrenchLabels } from "@/app/actions/mind-french-labels";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { knownFrenchLabel } from "@/lib/finance/pos-french-catalog";
import { financePosEnglish } from "@/lib/finance/pos-locale";

export function useMindFrenchCatalog(snapshot?: FinanceSnapshot) {
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(new Map());
  const scope = snapshot ? `branda.mind.french-catalog.v1.${snapshot.cafe.id}.${snapshot.userId}` : "";
  const signature = useMemo(() => {
    if (!snapshot) return "[]";
    const names = new Set([
      ...snapshot.products.flatMap(product => [product.name, product.category]),
      ...snapshot.accounts.map(account => account.name),
      ...snapshot.warehouses.map(warehouse => warehouse.name),
    ]);
    const missing = [...names].filter(name => name && name.length <= 500 && !knownFrenchLabel(name, financePosEnglish[name]));
    return JSON.stringify(missing.sort());
  }, [snapshot]);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    const names: string[] = JSON.parse(signature);
    const allowed = new Set(names);
    const cached = new Map<string, string>();
    try {
      for (const [name, value] of JSON.parse(localStorage.getItem(scope) ?? "[]")) {
        if (allowed.has(name) && typeof value === "string" && value) cached.set(name, value);
      }
    } catch { /* Storage can be unavailable in private mode */ }
    setLabels(new Map(cached));
    let loading = false;
    async function load() {
      if (loading || !navigator.onLine) return;
      loading = true;
      try {
        const missing = names.filter(name => !cached.has(name));
        for (let offset = 0; active && offset < missing.length; offset += 64) {
          const result = await fetchMindFrenchLabels(missing.slice(offset, offset + 64));
          if (!active || !result.length) break;
          for (const [name, value] of result) cached.set(name, value);
          setLabels(new Map(cached));
          try { localStorage.setItem(scope, JSON.stringify([...cached])); } catch { /* In-memory labels still work */ }
        }
      } catch { /* Retry on reconnect or when the cashier reopens French */ }
      finally { loading = false; }
    }
    void load();
    window.addEventListener("online", load);
    return () => { active = false; window.removeEventListener("online", load); };
  }, [scope, signature]);
  return labels;
}
