/** Advance a server timestamp using elapsed time, never the device's wall clock. */
export function createServerClock(serverTime: number, elapsedNow: () => number = () => performance.now()) {
  if (!Number.isFinite(serverTime)) throw new Error("Server time unavailable");
  const receivedAt = elapsedNow();
  return () => serverTime + Math.max(0, elapsedNow() - receivedAt);
}

const snapshotClocks = new WeakMap<object, () => number>();
/** Cached snapshots retain their original receipt time when navigation reuses them. */
export function snapshotServerClock(snapshot: { serverTime: number }) {
  let clock = snapshotClocks.get(snapshot);
  if (!clock) { clock = createServerClock(snapshot.serverTime); snapshotClocks.set(snapshot, clock); }
  return clock;
}
