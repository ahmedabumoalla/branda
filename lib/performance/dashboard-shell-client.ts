"use client";

import { fetchOwnerDashboardShellAction } from "@/app/actions/dashboard-shell";

export type DashboardShellSnapshot = Awaited<ReturnType<typeof fetchOwnerDashboardShellAction>>;

const DASHBOARD_SHELL_TTL_MS = 30_000;
let cachedSnapshot: { at: number; value: DashboardShellSnapshot } | null = null;
let pendingSnapshot: Promise<DashboardShellSnapshot> | null = null;
let snapshotGeneration = 0;

function removeLegacySessionSnapshot() {
  try {
    sessionStorage.removeItem("barndaksa_dashboard_shell_snapshot");
  } catch { /* Storage may be unavailable. Never persist private account snapshots. */ }
}

function writeSessionSnapshot(value: DashboardShellSnapshot) {
  if ((value as { unauthenticated?: boolean }).unauthenticated) {
    clearDashboardShellSnapshot();
    return;
  }
  cachedSnapshot = { at: performance.now(), value };
}

// Only the current server-rendered layout may seed its account snapshot.
// A fresh layout replaces the previous account and invalidates its pending requests.
export function primeDashboardShellSnapshot(value: DashboardShellSnapshot | null) {
  clearDashboardShellSnapshot();
  if (value) writeSessionSnapshot(value);
}

function redirectUnauthenticatedDashboard(value: DashboardShellSnapshot) {
  if ((value as { unauthenticated?: boolean }).unauthenticated && typeof window !== "undefined") {
    window.location.replace("/login");
  }
  return value;
}

export function getCachedDashboardShellSnapshot() {
  if (cachedSnapshot && Array.isArray(cachedSnapshot.value.serviceSubscriptions) && performance.now() - cachedSnapshot.at < DASHBOARD_SHELL_TTL_MS) {
    return Promise.resolve(cachedSnapshot.value);
  }

  removeLegacySessionSnapshot();

  if (pendingSnapshot) return pendingSnapshot;

  const generation = snapshotGeneration;
  const request = fetchOwnerDashboardShellAction()
    .then((snapshot) => {
      if (generation !== snapshotGeneration) throw new Error("Dashboard context changed");
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
  removeLegacySessionSnapshot();
}
