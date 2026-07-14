import type { TableWarsTeam } from "@/lib/table-wars/v2-types";

export const TABLE_WARS_V2_TOTAL_CELLS = 12;
export const TABLE_WARS_V2_MAX_PLAYERS_PER_TEAM = 2;
export const TABLE_WARS_V2_LOBBY_SECONDS = 30;

const BASE_POSITIONS: Record<number, { x: number; y: number }> = {
  1: { x: 16, y: 28 },
  2: { x: 16, y: 72 },
  11: { x: 84, y: 28 },
  12: { x: 84, y: 72 },
};

const NEUTRAL_POSITIONS = [
  { x: 32, y: 18 },
  { x: 32, y: 48 },
  { x: 32, y: 82 },
  { x: 48, y: 31 },
  { x: 52, y: 69 },
  { x: 68, y: 18 },
  { x: 68, y: 52 },
  { x: 68, y: 82 },
];

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededNeutralPositions(seed: string) {
  const random = createSeededRandom(seed);
  const positions = NEUTRAL_POSITIONS.map((position) => ({ ...position }));

  for (let index = positions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [positions[index], positions[swapIndex]] = [positions[swapIndex], positions[index]];
  }

  return positions.map((position) => ({
    x: Math.max(27, Math.min(73, position.x + Math.round((random() - 0.5) * 6))),
    y: Math.max(14, Math.min(86, position.y + Math.round((random() - 0.5) * 8))),
  }));
}

export function tableWarsCellPosition(slotIndex: number, seed: string | null) {
  const basePosition = BASE_POSITIONS[slotIndex];
  if (basePosition) return basePosition;

  const neutralIndex = slotIndex - 3;
  return seededNeutralPositions(seed ?? "table-wars-default")[neutralIndex] ?? { x: 50, y: 50 };
}

export function tableWarsHomeSlots(team: TableWarsTeam) {
  return team === "blue" ? [1, 2] : [11, 12];
}

export function tableWarsConnectedSlots(slotIndex: number) {
  if (slotIndex < 1 || slotIndex > TABLE_WARS_V2_TOTAL_CELLS) return [];
  const previous = ((slotIndex + 10) % TABLE_WARS_V2_TOTAL_CELLS) + 1;
  const next = (slotIndex % TABLE_WARS_V2_TOTAL_CELLS) + 1;
  const opposite = ((slotIndex + 5) % TABLE_WARS_V2_TOTAL_CELLS) + 1;
  return [previous, next, opposite];
}

export function areTableWarsSlotsConnected(fromSlot: number, toSlot: number) {
  return tableWarsConnectedSlots(fromSlot).includes(toSlot);
}
