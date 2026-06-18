"use client";

import { fetchOwnerDashboardShellAction } from "@/app/actions/dashboard-shell";

type DashboardShellSnapshot = Awaited<ReturnType<typeof fetchOwnerDashboardShellAction>>;

const DASHBOARD_SHELL_TTL_MS = 30_000;
let cachedSnapshot: { at: number; value: DashboardShellSnapshot } | null = null;
let pendingSnapshot: Promise<DashboardShellSnapshot> | null = null;

function readSessionSnapshot(): DashboardShellSnapshot | null {
  try {
    const raw = sessionStorage.getItem("barndaksa_dashboard_shell_snapshot");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: DashboardShellSnapshot };
    if (Date.now() - parsed.at > DASHBOARD_SHELL_TTL_MS) {
      sessionStorage.removeItem("barndaksa_dashboard_shell_snapshot");
      return null;
    }
    cachedSnapshot = parsed;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeSessionSnapshot(value: DashboardShellSnapshot) {
  if ((value as { unauthenticated?: boolean }).unauthenticated) {
    clearDashboardShellSnapshot();
    return;
  }
  cachedSnapshot = { at: Date.now(), value };
  try {
    sessionStorage.setItem("barndaksa_dashboard_shell_snapshot", JSON.stringify(cachedSnapshot));
  } catch {}
}

function redirectUnauthenticatedDashboard(value: DashboardShellSnapshot) {
  if ((value as { unauthenticated?: boolean }).unauthenticated && typeof window !== "undefined") {
    window.location.replace("/login");
  }
  return value;
}

export function getCachedDashboardShellSnapshot() {
  if (cachedSnapshot && Date.now() - cachedSnapshot.at < DASHBOARD_SHELL_TTL_MS) {
    return Promise.resolve(cachedSnapshot.value);
  }

  const sessionSnapshot = readSessionSnapshot();
  if (sessionSnapshot) return Promise.resolve(redirectUnauthenticatedDashboard(sessionSnapshot));

  if (pendingSnapshot) return pendingSnapshot;

  pendingSnapshot = fetchOwnerDashboardShellAction()
    .then((snapshot) => {
      writeSessionSnapshot(snapshot);
      return redirectUnauthenticatedDashboard(snapshot);
    })
    .finally(() => {
      pendingSnapshot = null;
    });

  return pendingSnapshot;
}

export function clearDashboardShellSnapshot() {
  cachedSnapshot = null;
  pendingSnapshot = null;
  try {
    sessionStorage.removeItem("barndaksa_dashboard_shell_snapshot");
  } catch {}
}
