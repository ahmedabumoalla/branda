"use client";

import { fetchCustomerDetailAction } from "@/app/actions/finance-customer-detail";
import type { CustomerDetailTab } from "./customer-detail";

type Result = Awaited<ReturnType<typeof fetchCustomerDetailAction>>;

/** Private to one mounted customer and snapshot/revision, never persisted or shared across users. */
export function createCustomerDetailLoader(scope: { id: string; slug: string; revision: number; context: unknown }) {
  const saved = new Map<string, Result>();
  const pending = new Map<string, Promise<Result>>();
  return {
    peek(tab: CustomerDetailTab, page: number) { return saved.get(`${tab}:${page}`); },
    load(tab: CustomerDetailTab, page: number) {
      const key = `${tab}:${page}`;
      const cached = saved.get(key);
      if (cached) return Promise.resolve(cached);
      const running = pending.get(key);
      if (running) return running;
      const request = fetchCustomerDetailAction(scope.id, tab, page, scope.slug).then(result => {
        if (result.ok) {
          saved.set(key, result);
          if (saved.size > 24) saved.delete(saved.keys().next().value!);
        }
        return result;
      });
      pending.set(key, request);
      const release = () => { if (pending.get(key) === request) pending.delete(key); };
      void request.then(release, release);
      return request;
    },
  };
}
