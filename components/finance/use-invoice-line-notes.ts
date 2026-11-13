"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFinanceInvoiceLineNoteContext, getFinanceInvoiceLineNoteOptions, saveFinanceInvoiceCustomLineNotes, saveFinanceInvoiceLineNoteSelection } from "@/app/actions/finance-invoice-line-notes";
import type { InvoiceLineNoteContext } from "@/lib/finance/invoice-line-notes";

type Loaded = { slug: string; draftId: string | null; context: InvoiceLineNoteContext };
const toValues = (lines: InvoiceLineNoteContext["lines"]) => Object.fromEntries(lines.map(line => [line.key, line.notes])) as Record<number, string[]>;

export function useInvoiceLineNotes(slug: string, initialDraftId?: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [values, setValues] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const state = useRef<Loaded | null>(null), chosen = useRef<Record<number, string[]>>({});
  const requests = useRef({ version: 0 }), activeDraft = useRef<string | null>(initialDraftId ?? null);
  const fetchContext = useCallback((draftId: string | null) => {
    const version = ++requests.current.version;
    activeDraft.current = draftId;
    return getFinanceInvoiceLineNoteContext(slug, draftId).then(result => {
      if (version !== requests.current.version) return false;
      if (!result.ok) { setError(result.message); return false; }
      const next = { slug, draftId, context: result.data };
      state.current = next; chosen.current = toValues(result.data.lines);
      setLoaded(next); setValues(chosen.current); setError("");
      return true;
    }).catch(() => { if (version === requests.current.version) setError("تعذر تحميل ملاحظات البنود أعد المحاولة"); return false; })
      .finally(() => { if (version === requests.current.version) setLoading(false); });
  }, [slug]);
  const loadDraft = useCallback((draftId: string | null) => { setLoading(true); setError(""); return fetchContext(draftId); }, [fetchContext]);
  useEffect(() => {
    const pending = requests.current;
    if (!initialDraftId) void fetchContext(null);
    return () => { pending.version++; };
  }, [initialDraftId, fetchContext]);

  async function save(draftId: string, draftRevision: number, keys: number[]) {
    const current = state.current;
    if (!current || current.slug !== slug || loading || error) return { ok: false as const, message: "أعد تحميل ملاحظات البنود قبل حفظ الفاتورة" };
    const result = await saveFinanceInvoiceLineNoteSelection(slug, {
      draftId, draftRevision, revision: current.draftId === draftId ? current.context.revision : 0,
      lines: keys.filter(key => chosen.current[key]?.length).map(key => ({ key, notes: chosen.current[key] })),
    });
    if (!result.ok) { activeDraft.current = draftId; setError(result.message); return result; }
    const next = { ...current, draftId, context: { ...current.context, ...result.data, hasSelection: true } };
    state.current = next; activeDraft.current = draftId; chosen.current = toValues(result.data.lines);
    setLoaded(next); setValues(chosen.current);
    return { ok: true as const };
  }
  async function saveCustom(texts: string[]) {
    const current = state.current;
    if (!current || current.slug !== slug) return { ok: false, message: "أعد تحميل مكتبة الملاحظات" };
    const result = await saveFinanceInvoiceCustomLineNotes(slug, texts, current.context.settingsRevision);
    const options = result.ok ? { ok: true as const, data: { enabled: result.data.settings.enabled, notes: result.data.settings.enabled ? result.data.settings.notes.filter(note => note.active).map(({ id, text }) => ({ id, text })) : [], revision: result.data.revision } } : await getFinanceInvoiceLineNoteOptions(slug);
    const latest = state.current;
    if (options.ok && latest?.slug === slug) {
      const next = { ...latest, context: { ...latest.context, enabled: options.data.enabled, notes: options.data.notes, settingsRevision: options.data.revision } };
      state.current = next; setLoaded(next);
    }
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  }
  const context = loaded?.slug === slug ? loaded.context : null;
  return {
    context, values, loading, error, ready: !!context && !loading && !error,
    change: (key: number, notes: string[]) => { chosen.current = { ...chosen.current, [key]: notes }; setValues(chosen.current); },
    loadDraft, save, saveCustom, retry: () => loadDraft(activeDraft.current),
  };
}
