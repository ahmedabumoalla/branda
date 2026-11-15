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
  useEffect(() => {
    let active = true;
    void (reader ? reader() : companyInvoiceIssuerAction(slug)).then(result => {
      if (active && result.ok) setLookup({ slug, issuer: invoiceIssuerFields(result.data), fromAccountSettings: result.data.fromAccountSettings });
    }).catch(() => { /* A failed lookup must not erase an existing draft identity. */ });
    return () => { active = false; };
  }, [slug, reader]);
  const restoreIssuer = useCallback((value: Issuer | undefined) => {
    setDrafts(current => ({ ...current, [slug]: value ? invoiceIssuerFields(value) : undefined }));
  }, [slug]);
  const current = lookup?.slug === slug ? lookup : null;
  const issuer = current?.fromAccountSettings ? current.issuer : drafts[slug] ?? current?.issuer ?? { name, vatNumber: "", address: "" };
  return { issuer, restoreIssuer };
}
