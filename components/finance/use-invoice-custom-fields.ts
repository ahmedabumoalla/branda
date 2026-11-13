"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFinanceInvoiceCustomFieldContext, saveFinanceInvoiceCustomFieldValues } from "@/app/actions/finance-invoice-custom-fields";
import { invoiceCustomFieldValueError, type InvoiceCustomFieldContext, type InvoiceCustomFieldValues } from "@/lib/finance/invoice-custom-fields";

type Loaded = { slug: string; draftId: string | null; context: InvoiceCustomFieldContext };
export function useInvoiceCustomFields(slug: string, initialDraftId?: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [values, setValues] = useState<InvoiceCustomFieldValues>({});
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const state = useRef<Loaded | null>(null), chosen = useRef<InvoiceCustomFieldValues>({});
  const requests = useRef({ version: 0 }), activeDraft = useRef<string | null>(initialDraftId ?? null);
  const fetchContext = useCallback((draftId: string | null) => {
    const version = ++requests.current.version;
    activeDraft.current = draftId;
    return getFinanceInvoiceCustomFieldContext(slug, draftId).then(result => {
      if (version !== requests.current.version) return false;
      if (!result.ok) { setError(result.message); return false; }
      const next = { slug, draftId, context: result.data };
      const fields = result.data.issued && result.data.savedSettings ? result.data.savedSettings.fields : result.data.settings.fields;
      const nextValues = Object.fromEntries(fields.filter(field => !['separator', 'free_static_content'].includes(field.type)).map(field => [field.id, Object.hasOwn(result.data.values, field.id) ? result.data.values[field.id] : result.data.hasSelection ? null : field.defaultValue]));
      state.current = next; chosen.current = nextValues;
      setLoaded(next); setValues(nextValues); setError(""); return true;
    }).catch(() => { if (version === requests.current.version) setError("تعذر تحميل حقول الفاتورة أعد المحاولة"); return false; })
      .finally(() => { if (version === requests.current.version) setLoading(false); });
  }, [slug]);
  const loadDraft = useCallback((draftId: string | null) => { setLoading(true); setError(""); return fetchContext(draftId); }, [fetchContext]);
  useEffect(() => { const pending = requests.current; if (!initialDraftId) void fetchContext(null); return () => { pending.version++; }; }, [initialDraftId, fetchContext]);
  const context = loaded?.slug === slug ? loaded.context : null;
  const settings = context?.issued && context.savedSettings ? context.savedSettings : context?.settings ?? null;
  function validate(required = false) {
    for (const field of settings?.fields ?? []) { const message = invoiceCustomFieldValueError(field, chosen.current[field.id], required); if (message) return `${field.label}: ${message}`; }
    return null;
  }
  async function save(draftId: string, draftRevision: number) {
    const current = state.current;
    if (!current || current.slug !== slug || loading || error) return { ok: false as const, message: "أعد تحميل حقول الفاتورة قبل الحفظ" };
    const invalid = validate(); if (invalid) return { ok: false as const, message: invalid };
    const result = await saveFinanceInvoiceCustomFieldValues(slug, { draftId, draftRevision, revision: current.draftId === draftId ? current.context.revision : 0, settingsRevision: current.context.settingsRevision, values: chosen.current });
    if (!result.ok) { activeDraft.current = draftId; setError(result.message); return result; }
    const next = { ...current, draftId, context: { ...current.context, ...result.data, hasSelection: true } };
    state.current = next; activeDraft.current = draftId; chosen.current = result.data.values;
    setLoaded(next); setValues(result.data.values); return { ok: true as const };
  }
  return { context, settings, values, loading, error, ready: !!context && !loading && !error, validate,
    change: (id: string, value: InvoiceCustomFieldValues[string]) => { chosen.current = { ...chosen.current, [id]: value }; setValues(chosen.current); },
    loadDraft, save, retry: () => loadDraft(activeDraft.current) };
}
