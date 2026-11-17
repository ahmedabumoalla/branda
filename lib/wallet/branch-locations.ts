/** Apple relevance and Google MerchantLocations both allow at most ten locations */
export const MAX_WALLET_LOCATIONS = 10;

export type WalletBranchLocation = {
  latitude: number;
  longitude: number;
  branchName?: string;
  nearbyMessage?: string;
};

export type WalletLocationBranch = {
  id: string;
  name?: string;
  lat: unknown;
  lng: unknown;
  active: boolean;
  deletedAt?: string | null;
  primary?: boolean;
  sortOrder?: number;
  welcomeMessage?: string | null;
  walletLocationManaged?: boolean;
};

function coordinate(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= maximum ? number : null;
}

export function validWalletCoordinates(lat: unknown, lng: unknown) {
  const latitude = coordinate(lat, 90), longitude = coordinate(lng, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

export function walletLocationText(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240) : "";
}

/** Also used by branch management to make provider coverage limits explicit */
export function selectBranchWalletLocations(branches: readonly WalletLocationBranch[]) {
  const configured = branches.some(branch => branch.walletLocationManaged || branch.lat != null || branch.lng != null);
  const sorted = branches.filter(branch => branch.active && !branch.deletedAt).slice().sort((a, b) =>
    Number(Boolean(b.primary)) - Number(Boolean(a.primary))
    || (Number.isFinite(a.sortOrder) ? a.sortOrder! : 0) - (Number.isFinite(b.sortOrder) ? b.sortOrder! : 0)
    || a.id.localeCompare(b.id, "en"));
  const unique = new Map<string, WalletBranchLocation>();
  const branchKeys = new Map<string, string>();
  for (const branch of sorted) {
    const coordinates = validWalletCoordinates(branch.lat, branch.lng);
    if (!coordinates) continue;
    const key = `${coordinates.latitude},${coordinates.longitude}`;
    branchKeys.set(branch.id, key);
    if (!unique.has(key)) unique.set(key, {
      ...coordinates,
      branchName: walletLocationText(branch.name),
      nearbyMessage: walletLocationText(branch.welcomeMessage),
    });
  }
  const selected = new Map([...unique.entries()].slice(0, MAX_WALLET_LOCATIONS));
  return {
    configured,
    locations: [...selected.values()],
    totalLocations: unique.size,
    coveredBranchIds: [...branchKeys].filter(([, key]) => selected.has(key)).map(([id]) => id),
    excludedBranchIds: [...branchKeys].filter(([, key]) => !selected.has(key)).map(([id]) => id),
  };
}

/** Validate again at the provider boundary without exposing branch metadata to Google */
export function normalizeWalletLocations(locations: readonly WalletBranchLocation[]) {
  const result: WalletBranchLocation[] = [];
  const seen = new Set<string>();
  for (const location of locations) {
    const coordinates = validWalletCoordinates(location.latitude, location.longitude);
    if (!coordinates) continue;
    const key = `${coordinates.latitude},${coordinates.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...coordinates, branchName: walletLocationText(location.branchName), nearbyMessage: walletLocationText(location.nearbyMessage) });
    if (result.length === MAX_WALLET_LOCATIONS) break;
  }
  return result;
}
