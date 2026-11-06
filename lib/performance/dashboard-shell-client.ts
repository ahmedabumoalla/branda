"use client";

import { fetchOwnerDashboardShellAction } from "@/app/actions/dashboard-shell";

export type DashboardShellSnapshot = Awaited<ReturnType<typeof fetchOwnerDashboardShellAction>>;

const DASHBOARD_SHELL_TTL_MS = 30_000;
let cachedSnapshot: { at: number; value: DashboardShellSnapshot } | null = null;
let pendingSnapshot: Promise<DashboardShellSnapshot> | null = null;
let snapshotGeneration = 0;

function readSessionSnapshot(): DashboardShellSnapshot | null {
  try {
    const raw = sessionStorage.getItem("barndaksa_dashboard_shell_snapshot");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: DashboardShellSnapshot };
    if (Date.now() - parsed.at > DASHBOARD_SHELL_TTL_MS || !Array.isArray(parsed.value?.serviceSubscriptions)) {
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
  if (cachedSnapshot && Array.isArray(cachedSnapshot.value.serviceSubscriptions) && Date.now() - cachedSnapshot.at < DASHBOARD_SHELL_TTL_MS) {
    return Promise.resolve(cachedSnapshot.value);
  }

  const sessionSnapshot = readSessionSnapshot();
  if (sessionSnapshot) return Promise.resolve(redirectUnauthenticatedDashboard(sessionSnapshot));

  if (pendingSnapshot) return pendingSnapshot;

  const generation = snapshotGeneration;
  const request = fetchOwnerDashboardShellAction()
    .then((snapshot) => {
      if (generation !== snapshotGeneration) return snapshot;
      writeSessionSnapshot(snapshot);
      return redirectUnauthenticatedDashboard(snapshot);
    })
    .finally(() => {
      if (pendingSnapshot === request) pendingSnapshot = null;
    });
  pendingSnapshot = request;
  return request;
}

export function clearDashboardShellSnapshot() {
  snapshotGeneration++;
  cachedSnapshot = null;
  pendingSnapshot = null;
  try {
    sessionStorage.removeItem("barndaksa_dashboard_shell_snapshot");
  } catch {}
}
