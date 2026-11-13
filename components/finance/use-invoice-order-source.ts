"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFinanceOrderSourceContext, saveFinanceInvoiceOrderSource } from "@/app/actions/finance-order-sources";

type Context = Extract<Awaited<ReturnType<typeof getFinanceOrderSourceContext>>, { ok: true }>["data"];
type Loaded = { slug: string; draftId: string | null; context: Context };

/** The selection is persisted against the saved draft revision before issuing it. */
export function useInvoiceOrderSource(slug: string, initialDraftId?: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const current = useRef<Loaded | null>(null);
  const chosen = useRef<string | null>(null);
  const request = useRef({ version: 0 });
  const activeDraft = useRef<string | null>(initialDraftId ?? null);

  const fetchContext = useCallback((draftId: string | null) => {
    const version = ++request.current.version;
    activeDraft.current = draftId;
    return getFinanceOrderSourceContext(slug, draftId).then(result => {
      if (version !== request.current.version) return false;
      if (!result.ok) { setError(result.message); return false; }
      const next = { slug, draftId, context: result.data };
      const sourceId = result.data.hasSelection || result.data.issued ? result.data.selectedSourceId : result.data.defaultSelectionId;
      current.current = next; chosen.current = sourceId;
      setLoaded(next); setSelected(sourceId); setError("");
      return true;
    }).catch(() => {
      if (version === request.current.version) setError("تعذر تحميل مصدر الطلب أعد المحاولة");
      return false;
    }).finally(() => { if (version === request.current.version) setLoading(false); });
  }, [slug]);

  const loadDraft = useCallback((draftId: string | null) => {
    setLoading(true); setError("");
    return fetchContext(draftId);
  }, [fetchContext]);

  useEffect(() => {
    const pendingRequests = request.current;
    if (!initialDraftId) void fetchContext(null);
    return () => { pendingRequests.version++; };
  }, [initialDraftId, fetchContext]);

  async function save(draftId: string, draftRevision: number) {
    const state = current.current;
    if (!state || state.slug !== slug || loading || error) return { ok: false as const, message: "أعد تحميل مصدر الطلب قبل حفظ الفاتورة" };
    const result = await saveFinanceInvoiceOrderSource(slug, {
      draftId, draftRevision, sourceId: chosen.current,
      revision: state.draftId === draftId ? state.context.selectionRevision : 0,
    });
    if (!result.ok) { activeDraft.current = draftId; setError(result.message); return result; }
    const next = { ...state, draftId, context: { ...state.context, selectedSourceId: result.data.sourceId, selectionRevision: result.data.revision, hasSelection: true, issued: result.data.issued } };
    current.current = next; activeDraft.current = draftId;
    setLoaded(next);
    return { ok: true as const };
  }

  const context = loaded?.slug === slug ? loaded.context : null;
  return {
    context, selected, error, ready: !!context && !loading && !error, loading,
    choose: (id: string) => { chosen.current = id || null; setSelected(id || null); },
    loadDraft, save, retry: () => loadDraft(activeDraft.current),
  };
}
