"use client";

import { readInvoiceDetailPageAction } from "@/app/actions/finance-invoice-management";
import { getFinanceIssuedOrderSource } from "@/app/actions/finance-order-sources";
import type { FinanceSnapshot } from "./brand-finance";

type Page = Awaited<ReturnType<typeof readInvoiceDetailPageAction>>;
type Advanced = Pick<Page, "extensions" | "settings">;
type Source = Awaited<ReturnType<typeof getFinanceIssuedOrderSource>>;

/** Compare authorized data rather than reference-new RSC snapshots. */
export function invoiceDetailContext(snapshot: FinanceSnapshot) { return JSON.stringify(snapshot); }

export function invoiceDetailSession(snapshot: FinanceSnapshot) {
  return JSON.stringify([snapshot.cafe.id, snapshot.cafe.slug, snapshot.userId, snapshot.ownerUserId, snapshot.role, snapshot.canAdminister, snapshot.canManage]);
}

/** One invoice's authorized reads; only successful results are retained. */
export function createInvoiceDetailLoader(scope: { id: string; slug: string; context: unknown; revision?: number }) {
  const { id, slug } = scope;
  let valid = true;
  let pending: Promise<Page> | undefined;
  let detail: Page["detail"] | undefined;
  let failure: string | undefined;
  let advanced: Advanced | undefined;
  let source: Source | undefined;
  let sourcePending: Promise<Source> | undefined;
  function load() {
    if (pending) return pending;
    const request = readInvoiceDetailPageAction(id, slug).then(result => {
      if (valid) {
        detail = result.detail.ok ? result.detail : undefined;
        failure = result.detail.ok ? undefined : result.detail.message;
        advanced = result.extensions.ok && result.settings.ok ? { extensions: result.extensions, settings: result.settings } : undefined;
      }
      return result;
    });
    pending = request;
    const release = () => { if (pending === request) pending = undefined; };
    void request.then(release, release);
    return request;
  }
  return {
    peek: () => detail,
    error: () => failure,
    detail: () => detail ? Promise.resolve(detail) : load().then(result => result.detail),
    advanced: Object.assign(
      () => advanced ? Promise.resolve(advanced) : load().then(({ extensions, settings }) => ({ extensions, settings })),
      { peek: () => advanced, invalidate: () => { advanced = undefined; } },
    ),
    orderSource: {
      peek: () => source,
      load() {
        if (source) return Promise.resolve(source);
        if (sourcePending) return sourcePending;
        const request = getFinanceIssuedOrderSource(slug, id).then(result => {
          if (valid && result.ok) source = result;
          return result;
        });
        sourcePending = request;
        const release = () => { if (sourcePending === request) sourcePending = undefined; };
        void request.then(release, release);
        return request;
      },
    },
    invalidate() { valid = false; detail = undefined; advanced = undefined; source = undefined; failure = undefined; },
  };
}

export type InvoiceDetailLoader = ReturnType<typeof createInvoiceDetailLoader>;

/** Private to a mounted finance workspace: no module singleton or browser persistence. */
export function createInvoiceDetailCache() {
  const entries = new Map<string, { context: string; loader: InvoiceDetailLoader }>();
  let session: string | undefined;
  let revision = 0;
  function clear() {
    for (const entry of entries.values()) entry.loader.invalidate();
    entries.clear();
    revision++;
  }
  return {
    get revision() { return revision; },
    clear,
    get(scope: { id: string; slug: string; context: string; session: string }) {
      if (session !== scope.session) { clear(); session = scope.session; }
      const key = JSON.stringify([scope.slug, scope.id]);
      const saved = entries.get(key);
      if (saved?.context === scope.context) {
        entries.delete(key); entries.set(key, saved);
        return saved.loader;
      }
      saved?.loader.invalidate();
      const loader = createInvoiceDetailLoader(scope);
      entries.set(key, { context: scope.context, loader });
      if (entries.size > 24) {
        const oldest = entries.keys().next().value!;
        entries.get(oldest)!.loader.invalidate(); entries.delete(oldest);
      }
      return loader;
    },
  };
}

export type InvoiceDetailCache = ReturnType<typeof createInvoiceDetailCache>;
