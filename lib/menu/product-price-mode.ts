export type MenuProductPriceMode = "fixed" | "cashier";

export function readMenuProductPriceMode(details: unknown): MenuProductPriceMode | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const mode = (details as Record<string, unknown>).menuPriceMode;
  return mode === "fixed" || mode === "cashier" ? mode : undefined;
}

export function withMenuProductPriceMode(details: unknown, mode: MenuProductPriceMode): Record<string, unknown> {
  const next = details && typeof details === "object" && !Array.isArray(details) ? { ...details } as Record<string, unknown> : {};
  delete next.menuPriceRange;
  return { ...next, menuPriceMode: mode };
}
