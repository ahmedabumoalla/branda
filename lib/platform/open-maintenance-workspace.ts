import { maintenanceParam, workspaceStorageKey } from "./maintenance-workspace";

export function openMaintenanceWorkspace(destination: string) {
  const url = new URL(destination, location.origin);
  const workspace = url.searchParams.get(maintenanceParam);
  if (workspace) {
    try { localStorage.setItem(workspaceStorageKey, workspace); } catch { /* Server still checks the workspace */ }
  }
  window.location.assign(destination);
}
