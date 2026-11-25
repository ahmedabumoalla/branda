import { brandPicker, isMaintenancePath, maintenanceParam, workspaceStorageKey } from "./lib/platform/maintenance-workspace";

// Keep Next's client-only navigation and native history updates tied to the
// workspace this document actually loaded, including Back and cached routes.
const workspace = typeof window === "undefined" ? null : new URL(window.location.href).searchParams.get(maintenanceParam);
if (workspace && isMaintenancePath(location.pathname)) {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (state, title, destination) => {
      if (destination != null) {
        const url = new URL(destination, location.href);
        if (url.origin === location.origin && isMaintenancePath(location.pathname) && isMaintenancePath(url.pathname))
          url.searchParams.set(maintenanceParam, workspace);
        destination = url.href;
      }
      return original(state, title, destination);
    };
  }
  const check = (event: Event) => {
    if (!isMaintenancePath(location.pathname)) return;
    let active: string | null;
    try { active = localStorage.getItem(workspaceStorageKey); } catch { return; }
    if (active && active !== workspace) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.replace(brandPicker);
    }
  };
  window.addEventListener("storage", check);
  window.addEventListener("pageshow", check);
  window.addEventListener("focus", check);
  document.addEventListener("click", check, true);
  document.addEventListener("submit", check, true);
}
