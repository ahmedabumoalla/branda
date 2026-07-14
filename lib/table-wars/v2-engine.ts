import type {
  TableWarsTeam,
  TableWarsV2Cell,
  TableWarsV2Player,
  TableWarsV2Unit,
} from "@/lib/table-wars/v2-types";
import { areTableWarsSlotsConnected } from "@/lib/table-wars/v2-map";

const GROWTH_INTERVAL_MS = 2_000;
const ROAD_BATTLE_PROGRESS_WINDOW = 0.08;
const MIN_AI_SOURCE_SOLDIERS = 8;
const AI_MIN_DELAY_MS = 3_500;
const AI_DELAY_SPREAD_MS = 1_500;

export type TableWarsV2EngineEvent = {
  eventType: "road_battle" | "arrival";
  payload: Record<string, unknown>;
};

export type TableWarsV2CellUpdate = Pick<
  TableWarsV2Cell,
  "id" | "team" | "assignedPlayerId" | "soldiers"
>;

export type TableWarsV2UnitUpdate = Pick<TableWarsV2Unit, "id" | "soldiers" | "status">;

export type TableWarsV2AiMove = {
  playerId: string;
  team: TableWarsTeam;
  fromCellId: string;
  toCellId: string;
  soldiers: number;
  laneIndex: number;
  laneCount: number;
  travelMs: number;
};

export function determineWinningTeam(cells: TableWarsV2Cell[]): TableWarsTeam | null {
  if (cells.length === 0) return null;
  const firstTeam = cells[0]?.team;
  if (firstTeam !== "blue" && firstTeam !== "red") return null;
  return cells.every((cell) => cell.team === firstTeam) ? firstTeam : null;
}

export function calculateAvailableLanes(soldiers: number) {
  if (soldiers <= 20) return 1;
  if (soldiers <= 40) return 2;
  return 3;
}

export function canPlayerControlCell(
  player: TableWarsV2Player,
  cell: TableWarsV2Cell,
  controlledUnassignedCount: number,
) {
  if (player.role !== "player" && player.role !== "ai") return false;
  if (cell.roundId !== player.roundId || cell.cafeId !== player.cafeId) return false;
  if (cell.assignedPlayerId === player.id || cell.id === player.baseCellId) return true;
  if (cell.assignedPlayerId) return false;
  return cell.team === player.team && controlledUnassignedCount < 5;
}

export function buildUnitTravelTime(fromCell: TableWarsV2Cell, toCell: TableWarsV2Cell) {
  const distance = Math.hypot(toCell.x - fromCell.x, toCell.y - fromCell.y);
  return Math.round(1_400 + distance * 18);
}

export function growCells(
  cells: TableWarsV2Cell[],
  lastTickAt: string | null,
  now: Date,
) {
  const lastTickTime = lastTickAt ? Date.parse(lastTickAt) : 0;
  if (Number.isFinite(lastTickTime) && now.getTime() - lastTickTime < GROWTH_INTERVAL_MS) {
    return { cells, changedCells: [] as TableWarsV2CellUpdate[], didGrow: false };
  }

  const changedCells: TableWarsV2CellUpdate[] = [];
  const nextCells = cells.map((cell) => {
    if (cell.team === "neutral" || cell.soldiers >= cell.maxSoldiers) return cell;

    const soldiers = Math.min(cell.maxSoldiers, cell.soldiers + 1);
    const nextCell = { ...cell, soldiers };
    changedCells.push(pickCellUpdate(nextCell));
    return nextCell;
  });

  return { cells: nextCells, changedCells, didGrow: true };
}

export function resolveArrivedUnits(
  cells: TableWarsV2Cell[],
  units: TableWarsV2Unit[],
  now: Date,
) {
  const cellById = new Map(cells.map((cell) => [cell.id, { ...cell }]));
  const changedCells = new Map<string, TableWarsV2CellUpdate>();
  const changedUnits: TableWarsV2UnitUpdate[] = [];
  const events: TableWarsV2EngineEvent[] = [];

  for (const unit of units) {
    const arrivesTime = unit.arrivesAt ? Date.parse(unit.arrivesAt) : Number.POSITIVE_INFINITY;
    if (unit.status !== "moving" || arrivesTime > now.getTime()) continue;

    const target = cellById.get(unit.toCellId);
    if (!target) continue;

    if (target.team === unit.team) {
      target.soldiers = Math.min(target.maxSoldiers, target.soldiers + unit.soldiers);
    } else if (unit.soldiers > target.soldiers) {
      const survivors = unit.soldiers - target.soldiers;
      target.team = unit.team;
      target.soldiers = Math.min(target.maxSoldiers, survivors);
      target.assignedPlayerId = unit.ownerPlayerId;
    } else if (unit.soldiers < target.soldiers) {
      target.soldiers -= unit.soldiers;
    } else {
      target.soldiers = 0;
      if (target.team === "neutral") target.assignedPlayerId = null;
    }

    changedCells.set(target.id, pickCellUpdate(target));
    changedUnits.push({ id: unit.id, soldiers: unit.soldiers, status: "resolved" });
    events.push({
      eventType: "arrival",
      payload: {
        unitId: unit.id,
        toCellId: unit.toCellId,
        team: unit.team,
        soldiers: unit.soldiers,
      },
    });
  }

  const nextCells = cells.map((cell) => cellById.get(cell.id) ?? cell);
  const resolvedIds = new Set(changedUnits.map((unit) => unit.id));
  const nextUnits = units.map((unit) =>
    resolvedIds.has(unit.id) ? { ...unit, status: "resolved" as const } : unit,
  );

  return {
    cells: nextCells,
    units: nextUnits,
    changedCells: [...changedCells.values()],
    changedUnits,
    events,
  };
}

export function resolveRoadBattles(units: TableWarsV2Unit[], now: Date) {
  const nextUnits = units.map((unit) => ({ ...unit }));
  const changedUnits = new Map<string, TableWarsV2UnitUpdate>();
  const events: TableWarsV2EngineEvent[] = [];

  for (let indexA = 0; indexA < nextUnits.length; indexA += 1) {
    const unitA = nextUnits[indexA];
    if (!unitA || unitA.status !== "moving") continue;

    for (let indexB = indexA + 1; indexB < nextUnits.length; indexB += 1) {
      const unitB = nextUnits[indexB];
      if (!unitB || unitB.status !== "moving") continue;
      if (!areOpposingUnits(unitA, unitB)) continue;
      if (!areUnitsMeeting(unitA, unitB, now)) continue;

      const originalA = unitA.soldiers;
      const originalB = unitB.soldiers;

      if (unitA.soldiers > unitB.soldiers) {
        unitA.soldiers -= unitB.soldiers;
        unitB.status = "cancelled";
      } else if (unitB.soldiers > unitA.soldiers) {
        unitB.soldiers -= unitA.soldiers;
        unitA.status = "cancelled";
      } else {
        unitA.status = "cancelled";
        unitB.status = "cancelled";
      }

      changedUnits.set(unitA.id, pickUnitUpdate(unitA));
      changedUnits.set(unitB.id, pickUnitUpdate(unitB));
      events.push({
        eventType: "road_battle",
        payload: {
          unitAId: unitA.id,
          unitBId: unitB.id,
          fromCellId: unitA.fromCellId,
          toCellId: unitA.toCellId,
          teamA: unitA.team,
          teamB: unitB.team,
          soldiersA: originalA,
          soldiersB: originalB,
          remainingA: unitA.status === "moving" ? unitA.soldiers : 0,
          remainingB: unitB.status === "moving" ? unitB.soldiers : 0,
        },
      });

      if (unitA.status !== "moving") break;
    }
  }

  return {
    units: nextUnits,
    changedUnits: [...changedUnits.values()],
    events,
  };
}

export function chooseAiMove(input: {
  cells: TableWarsV2Cell[];
  units: TableWarsV2Unit[];
  players: TableWarsV2Player[];
  now: Date;
  lastAiMoveAtByTeam?: Partial<Record<TableWarsTeam, string | null>>;
}) {
  const aiPlayers = input.players
    .filter((player) => player.role === "ai")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const aiPlayer of aiPlayers) {
    const lastMoveAt = input.lastAiMoveAtByTeam?.[aiPlayer.team] ?? null;
    if (!isAiMoveDue(aiPlayer.team, lastMoveAt, input.now)) continue;

    const move = chooseAiMoveForPlayer(aiPlayer, input.cells, input.units);
    if (move) return move;
  }

  return null;
}

function chooseAiMoveForPlayer(
  aiPlayer: TableWarsV2Player,
  cells: TableWarsV2Cell[],
  units: TableWarsV2Unit[],
): TableWarsV2AiMove | null {
  const sources = cells
    .filter((cell) => {
      if (cell.team !== aiPlayer.team || cell.soldiers < MIN_AI_SOURCE_SOLDIERS) return false;
      const laneCount = calculateAvailableLanes(cell.soldiers);
      return getOutgoingUnits(units, cell.id).length < laneCount;
    })
    .sort((a, b) => b.soldiers - a.soldiers || a.slotIndex - b.slotIndex);

  for (const source of sources) {
    const candidates = cells.filter(
      (cell) =>
        cell.id !== source.id &&
        cell.team !== aiPlayer.team &&
        areTableWarsSlotsConnected(source.slotIndex, cell.slotIndex),
    );
    if (candidates.length === 0) continue;

    const target =
      candidates
        .filter((cell) => cell.team === "neutral")
        .sort((a, b) => a.soldiers - b.soldiers || distance(source, a) - distance(source, b))[0] ??
      candidates
        .filter((cell) => cell.team !== "neutral")
        .sort((a, b) => a.soldiers - b.soldiers || distance(source, a) - distance(source, b))[0];

    if (!target) continue;

    const laneCount = calculateAvailableLanes(source.soldiers);
    const laneIndex = nextLaneIndex(units, source.id, laneCount);
    if (laneIndex === null) continue;

    const soldiers = Math.floor(source.soldiers / 2);
    if (soldiers < MIN_AI_SOURCE_SOLDIERS / 2) continue;

    return {
      playerId: aiPlayer.id,
      team: aiPlayer.team,
      fromCellId: source.id,
      toCellId: target.id,
      soldiers,
      laneIndex,
      laneCount,
      travelMs: buildUnitTravelTime(source, target),
    };
  }

  return null;
}

function isAiMoveDue(team: TableWarsTeam, lastMoveAt: string | null, now: Date) {
  const lastMoveTime = lastMoveAt ? Date.parse(lastMoveAt) : 0;
  if (!Number.isFinite(lastMoveTime) || lastMoveTime <= 0) return true;
  const teamOffset = team === "blue" ? 0 : AI_DELAY_SPREAD_MS / 2;
  return now.getTime() - lastMoveTime >= AI_MIN_DELAY_MS + teamOffset;
}

function areOpposingUnits(unitA: TableWarsV2Unit, unitB: TableWarsV2Unit) {
  return (
    unitA.team !== unitB.team &&
    unitA.fromCellId === unitB.toCellId &&
    unitA.toCellId === unitB.fromCellId
  );
}

function areUnitsMeeting(unitA: TableWarsV2Unit, unitB: TableWarsV2Unit, now: Date) {
  const progressA = unitProgress(unitA, now);
  const progressB = unitProgress(unitB, now);
  return Math.abs(progressA - (1 - progressB)) <= ROAD_BATTLE_PROGRESS_WINDOW;
}

function unitProgress(unit: TableWarsV2Unit, now: Date) {
  const startedAt = unit.startedAt ? Date.parse(unit.startedAt) : now.getTime();
  const arrivesAt = unit.arrivesAt ? Date.parse(unit.arrivesAt) : startedAt + 1;
  const duration = Math.max(1, arrivesAt - startedAt);
  return Math.min(1, Math.max(0, (now.getTime() - startedAt) / duration));
}

function getOutgoingUnits(units: TableWarsV2Unit[], cellId: string) {
  return units.filter((unit) => unit.status === "moving" && unit.fromCellId === cellId);
}

function nextLaneIndex(units: TableWarsV2Unit[], cellId: string, laneCount: number) {
  const usedLaneIndexes = new Set(getOutgoingUnits(units, cellId).map((unit) => unit.laneIndex));
  for (let index = 0; index < laneCount; index += 1) {
    if (!usedLaneIndexes.has(index)) return index;
  }
  return null;
}

function distance(fromCell: TableWarsV2Cell, toCell: TableWarsV2Cell) {
  return Math.hypot(toCell.x - fromCell.x, toCell.y - fromCell.y);
}

function pickCellUpdate(cell: TableWarsV2Cell): TableWarsV2CellUpdate {
  return {
    id: cell.id,
    team: cell.team,
    assignedPlayerId: cell.assignedPlayerId,
    soldiers: cell.soldiers,
  };
}

function pickUnitUpdate(unit: TableWarsV2Unit): TableWarsV2UnitUpdate {
  return {
    id: unit.id,
    soldiers: unit.soldiers,
    status: unit.status,
  };
}
