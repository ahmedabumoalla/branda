import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Only the authenticated ERP route creates this scope. Never populated from
// request headers or shared process variables; concurrent brands remain isolated.
const tenant = new AsyncLocalStorage<string>();
export function erpRequestSlug() { return tenant.getStore(); }
export function withErpRequest<T>(slug: string, render: () => Promise<T>) {
  return tenant.run(slug, render);
}
