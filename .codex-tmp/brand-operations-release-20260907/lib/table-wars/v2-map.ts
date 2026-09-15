import type { TableWarsTeam, TableWarsV2Cell } from "@/lib/table-wars/v2-types";

export const TABLE_WARS_V2_TOTAL_CELLS = 12;
export const TABLE_WARS_V2_MAX_PLAYERS_PER_TEAM = 2;
export const TABLE_WARS_V2_LOBBY_SECONDS = 30;

const BASE_POSITIONS: Record<number, { x: number; y: number }> = {
  1: { x: 13, y: 26 },
  2: { x: 13, y: 74 },
  11: { x: 87, y: 26 },
  12: { x: 87, y: 74 },
};

const NEUTRAL_POSITIONS = [
  { x: 31, y: 16 },
  { x: 31, y: 50 },
  { x: 31, y: 84 },
  { x: 50, y: 29 },
  { x: 50, y: 71 },
  { x: 69, y: 16 },
  { x: 69, y: 50 },
  { x: 69, y: 84 },
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

  return positions;
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

type PositionedCell = Pick<TableWarsV2Cell, "slotIndex" | "x" | "y">;

export function tableWarsConnectedSlots(cells: PositionedCell[], slotIndex: number) {
  const source = cells.find((cell) => cell.slotIndex === slotIndex);
  if (!source) return [];

  return cells
    .filter((cell) => cell.slotIndex !== slotIndex)
    .map((cell) => ({
      slotIndex: cell.slotIndex,
      distance: Math.hypot(cell.x - source.x, cell.y - source.y),
    }))
    .sort((a, b) => a.distance - b.distance || a.slotIndex - b.slotIndex)
    .slice(0, 3)
    .map((cell) => cell.slotIndex);
}

export function areTableWarsSlotsConnected(cells: PositionedCell[], fromSlot: number, toSlot: number) {
  return tableWarsConnectedSlots(cells, fromSlot).includes(toSlot);
}
