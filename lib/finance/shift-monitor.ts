import type { FinanceShift } from "./brand-finance";
export type MonitoredShift = FinanceShift & {
  supervisor_paused: boolean; drawer_name: string; employee_name: string; current_expected: number;
  monitor_status: "active" | "stalled" | "paused" | "closed";
  last_seen_at: string | null; pending_count: number; conflict_count: number;
};
export type ShiftMonitorPage = { rows: MonitoredShift[]; total: number; checkedAt: string; actions: { id: string; action: "pause" | "resume" | "close"; reason: string; actor_name: string; created_at: string }[] };
export type ShiftMonitorFilter = { offset: number; query: string; from: string; to: string; shiftId?: string };
