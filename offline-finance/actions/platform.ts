import { currentContext } from "./context";
export const revalidatePath = (..._args: any[]) => undefined;
export const revalidateTag = (..._args: any[]) => undefined;
export const updateTag = (..._args: any[]) => undefined;
export const unstable_noStore = () => undefined;
export const unstable_cache = (fn: any, ..._args: any[]) => fn;
export const cacheLife = (..._args: any[]) => undefined;
export const cacheTag = (..._args: any[]) => undefined;
// Cloud notification jobs are deliberately not scheduled by an offline request.
export const after = (_callback: any) => undefined;
export const getActiveUser = async (_client?: any) => currentContext().user;
export const getOptionalActiveUser = getActiveUser;
export const getCurrentMaintenanceSession = async () => null;
export const readMaintenanceSessionCookie = async () => null;
export const isMaintenanceMode = async () => false;
export const erpRequestSlug = () => currentContext().cafe.slug;
export const withErpRequest = async (_slug: string, fn: () => any) => fn();
export async function requireOwnerCafeContext() {
  const context = currentContext(); if (context.user.role !== "owner") throw new Error("هذه العملية متاحة للمالك فقط");
  return { ...context.cafe, role: "owner" };
}
export const getOwnerCafeContext = requireOwnerCafeContext;
export async function assertOwnerServiceEnabled(feature: string) {
  await requireOwnerCafeContext();
  if (!['menu', 'settings'].includes(feature)) throw new Error('هذه الخدمة غير متاحة في النسخة المحلية');
}
export async function getCafeContext() { return { ...currentContext().cafe, role: currentContext().user.role }; }
export async function getCafeBySlug(slug: string) { const c = currentContext().cafe; return slug === c.slug ? { ...c, business_category: c.businessCategory, status: "active" } : null; }
export const getPublicCafeBySlugAdmin = getCafeBySlug;
export async function requireCafeContext() { return getCafeContext(); }
export async function requireActiveCafeContext() { return getCafeContext(); }
export async function headers() { return new Headers(); }
export async function cookies() { return { get: () => undefined, getAll: () => [], set: () => undefined, delete: () => undefined }; }
export function redirect(path: string): never { throw new Error("Local navigation required: " + path); }
export function notFound(): never { throw new Error("الصفحة غير موجودة"); }
export const NextResponse = { json: (value: any, init?: ResponseInit) => Response.json(value, init), redirect: (url: string, init: number | ResponseInit = 307) => { const options=typeof init==='number'?{status:init}:init; const target=new URL(url,currentContext().origin || 'http://127.0.0.1').href; return new Response(null,{...options,status:options.status || 307,headers:{...Object.fromEntries(new Headers(options.headers)),Location:target}}); } };
