// The URL identifies the intended workspace. Only the server-signed cookie authorizes it.
export const maintenanceParam = "maintenance";
export const maintenanceHeader = "x-branda-maintenance-workspace";
export const brandPicker = "/admin/cafes";
export const workspaceStorageKey = "branda-maintenance-workspace";
export const isMaintenancePath = (path: string) => /^\/(dashboard|finance)(\/|$)/.test(path);

export function maintenanceRequestScope(url: URL, referer: string | null, workspace: string | undefined) {
  const isPage = isMaintenancePath(url.pathname);
  const isApi = url.pathname.startsWith("/api/");
  if (!isPage && !isApi) return { blocked: false };

  let previous: URL | undefined;
  try { if (referer) previous = new URL(referer); } catch { /* Missing origin proof */ }
  const fromPage = previous?.origin === url.origin && isMaintenancePath(previous.pathname);
  const current = url.searchParams.get(maintenanceParam);
  const previousScope = fromPage ? previous?.searchParams.get(maintenanceParam) : null;
  const scope = current ?? previousScope;
  if (scope == null) return { blocked: false };
  if (!workspace || scope !== workspace || (previousScope && previousScope !== workspace)) return { blocked: true };
  return { blocked: false, scope, canonicalize: isPage && !current };
}
