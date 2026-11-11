import { createHash } from "node:crypto";

/** Opaque cache scope only; this digest never grants access to any operation. */
export function cashierWorkspaceKey(token: string) {
  return createHash("sha256").update(`branda:staff-workspace:v1:${token}`).digest("hex");
}
