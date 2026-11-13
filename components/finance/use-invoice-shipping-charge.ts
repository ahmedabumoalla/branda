"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFinanceInvoiceShippingChargeContext, saveFinanceInvoiceShippingCharge } from "@/app/actions/finance-invoice-shipping-charge";

type Context = Extract<Awaited<ReturnType<typeof getFinanceInvoiceShippingChargeContext>>, { ok: true }>["data"];
type Selection = Context["selection"];
type Loaded = { slug: string; draftId: string | null; context: Context };

export function useInvoiceShippingCharge(slug: string, initialDraftId?: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const state = useRef<Loaded | null>(null), chosen = useRef<Selection>(null);
  const requests = useRef({ version: 0 }), activeDraft = useRef<string | null>(initialDraftId ?? null);
  const fetchContext = useCallback((draftId: string | null) => {
    const version = ++requests.current.version;
    activeDraft.current = draftId;
    return getFinanceInvoiceShippingChargeContext(slug, draftId).then(result => {
      if (version !== requests.current.version) return false;
      if (!result.ok) { setError(result.message); return false; }
      const next = { slug, draftId, context: result.data };
      state.current = next; chosen.current = result.data.selection;
      setLoaded(next); setSelection(result.data.selection); setError("");
      return true;
    }).catch(() => { if (version === requests.current.version) setError("تعذر تحميل خيارات الشحن أعد المحاولة"); return false; })
      .finally(() => { if (version === requests.current.version) setLoading(false); });
  }, [slug]);
  const loadDraft = useCallback((draftId: string | null) => { setLoading(true); setError(""); return fetchContext(draftId); }, [fetchContext]);
  useEffect(() => {
    const pending = requests.current;
    if (!initialDraftId) void fetchContext(null);
    return () => { pending.version++; };
  }, [initialDraftId, fetchContext]);

  async function save(draftId: string, draftRevision: number) {
    const current = state.current;
    if (!current || current.slug !== slug || loading || error) return { ok: false as const, message: "أعد تحميل خيارات الشحن قبل حفظ الفاتورة" };
    const option = current.context.options.find(item => item.id === chosen.current?.optionId);
    const result = await saveFinanceInvoiceShippingCharge(slug, {
      draftId, draftRevision, revision: current.draftId === draftId ? current.context.revision : 0,
      settingsRevision: current.context.settingsRevision, optionRevision: option?.revision ?? null, selection: chosen.current,
    });
    if (!result.ok) { activeDraft.current = draftId; setError(result.message); return result; }
    const next = { ...current, draftId, context: { ...current.context, ...result.data, hasSelection: true } };
    state.current = next; activeDraft.current = draftId; chosen.current = result.data.selection;
    setLoaded(next); setSelection(result.data.selection);
    return { ok: true as const };
  }
  const context = loaded?.slug === slug ? loaded.context : null;
  return {
    context, selection, loading, error, ready: !!context && !loading && !error,
    change: (value: Selection) => { chosen.current = value; setSelection(value); },
    loadDraft, save, retry: () => loadDraft(activeDraft.current),
  };
}
