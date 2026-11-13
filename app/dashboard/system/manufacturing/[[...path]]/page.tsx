import { notFound } from "next/navigation";
import { readManufacturing } from "@/lib/data/erp-manufacturing";
import { manufacturingKinds, type ManufacturingKind } from "@/lib/erp/manufacturing";
import { ManufacturingWorkspace } from "@/components/erp/manufacturing/manufacturing-workspace";

export const dynamic = "force-dynamic";
export default async function ManufacturingPage({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { path = ["orders"] } = await params;
  const query = await searchParams;
  const settings = path[0] === "settings";
  const kind = settings ? "orders" : (path[0] ?? "orders") as ManufacturingKind;
  if (!manufacturingKinds.includes(kind) || path.length > 3) notFound();
  const mode = settings ? "settings" : path[1] === "new" ? "create" : path[2] === "edit" ? "edit" : path[1] ? "detail" : "list";
  const id = mode === "detail" || mode === "edit" ? path[1] : "";
  if (id && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) notFound();
  const q = typeof query.q === "string" ? query.q.slice(0, 150) : "";
  const status = typeof query.status === "string" ? query.status.slice(0, 100) : "";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(query.page)) || 1));
  let filters: Record<string,string> = {};try { const decoded = typeof query.cf === "string" ? JSON.parse(query.cf) : {};if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) filters=Object.fromEntries(Object.entries(decoded).filter(([k,v])=>k.length<=60&&typeof v==="string"&&v.length<=200)) as Record<string,string>; }catch {}
  const snapshot = await readManufacturing({ kind, id, query: q, status, page, filters });
  if (id && !snapshot.records.length) notFound();
  return <ManufacturingWorkspace key={`${kind}-${id}-${mode}-${snapshot.records[0]?.revision ?? 0}-${snapshot.settingsRevision}`} kind={kind} mode={mode} settingsPage={settings ? path[1] || "home" : ""} snapshot={snapshot} query={{ q, status, page, filters }} />;
}
