import { AsyncLocalStorage } from "node:async_hooks";

export type ActionContext = {
  origin?: string;
  user: { id: string; email?: string; name?: string; role: string };
  cafe: { id: string; slug: string; name: string; businessCategory: string };
  engine: { queryAs: (userId: string, sql: string, values?: unknown[]) => Promise<{ rows: any[] }>; rpc: (userId: string, name: string, args?: Record<string, unknown>) => Promise<any> };
  createUser?: (input: any) => Promise<any>;
  logout?: () => Promise<void>;
  storage?: {
    upload: (bucket: string, path: string, body: Uint8Array, options?: any) => Promise<any>;
    download: (bucket: string, path: string) => Promise<Blob>;
    remove: (bucket: string, paths: string[]) => Promise<any>;
    signUpload: (bucket: string, path: string) => Promise<{ signedUrl: string; token: string; path: string }>;
    signRead: (bucket: string, path: string) => Promise<string>;
  };
};
const scope = new AsyncLocalStorage<ActionContext>();
export function currentContext() {
  const value = scope.getStore();
  if (!value?.user?.id || !value.cafe?.id) throw new Error("سجل الدخول إلى المالية المحلية");
  return value;
}
export function runInContext<T>(context: ActionContext, callback: () => Promise<T>) { return scope.run(context, callback); }
