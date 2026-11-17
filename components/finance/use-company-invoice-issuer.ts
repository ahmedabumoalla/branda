"use client";

import { useCallback, useEffect, useState } from "react";
import { companyInvoiceIssuerAction } from "@/app/actions/finance-company-invoices";
import type { InvoiceDraftPayload } from "@/lib/finance/invoice-draft";

type Issuer = NonNullable<InvoiceDraftPayload["issuer"]>;

/** Only invoice fields belong in the strict saved document schema. */
export function invoiceIssuerFields(value: Issuer): Issuer {
  return { name: value.name, vatNumber: value.vatNumber, address: value.address };
}

export function useCompanyInvoiceIssuer(slug: string, name: string, reader?: () => ReturnType<typeof companyInvoiceIssuerAction>) {
  const [lookup, setLookup] = useState<{ slug: string; issuer: Issuer; fromAccountSettings: boolean } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Issuer | undefined>>({});
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void (reader ? reader() : companyInvoiceIssuerAction(slug)).then(result => {
      if (!active) return;
      if (result.ok) setLookup({ slug, issuer: invoiceIssuerFields(result.data), fromAccountSettings: result.data.fromAccountSettings });
      else setError(result.message);
    }).catch(() => { if (active) setError("تعذر تحميل بيانات المنشأة أعد المحاولة"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, reader, attempt]);
  const restoreIssuer = useCallback((value: Issuer | undefined) => {
    setDrafts(current => ({ ...current, [slug]: value ? invoiceIssuerFields(value) : undefined }));
  }, [slug]);
  const current = lookup?.slug === slug ? lookup : null;
  const issuer = current?.fromAccountSettings ? current.issuer : drafts[slug] ?? current?.issuer ?? { name, vatNumber: "", address: "" };
  return { issuer, restoreIssuer, loading, error, retry: () => setAttempt(value => value + 1) };
}
