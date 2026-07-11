"use client";

import { memo, useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from "react";
import type {
  TableWarsTeam,
  TableWarsV2Cell,
  TableWarsV2CellTeam,
  TableWarsV2Player,
  TableWarsV2Snapshot,
} from "@/lib/table-wars/v2-types";
import type {
  TableWarsRealtimeLiteConnectionStatus,
  TableWarsRealtimeLiteEvent,
  TableWarsRealtimeLiteMoveEvent,
} from "@/lib/table-wars/realtime-lite";

type Props = {
  cells: TableWarsV2Cell[];
  players: TableWarsV2Player[];
  externalEvents: TableWarsRealtimeLiteEvent[];
  currentPlayer: TableWarsV2Player | null;
  isPlayer: boolean;
  isHost: boolean;
  realtimeReady: boolean;
  realtimeStatus: TableWarsRealtimeLiteConnectionStatus;
  initialRoundFinished: boolean;
  initialWinnerMessage: string | null;
  role: TableWarsV2Snapshot["role"];
  onLocalEvent: (event: TableWarsRealtimeLiteEvent) => void | Promise<unknown>;
  onRoundFinished: (winningTeam: TableWarsTeam) => void;
  onNewRound: () => void;
  onMessage: (message: string) => void;
};

type Size = {
  width: number;
  height: number;
  dpr: number;
};

type LiteCell = TableWarsV2Cell & {
  localUpdatedAt: number;
};

type MovingUnit = {
  id: string;
  fromCellId: string;
  toCellId: string;
  team: TableWarsTeam;
  soldiers: number;
  startedAtMs: number;
  travelMs: number;
  laneIndex: number;
};

type Spark = {
  id: string;
  x: number;
  y: number;
  startedAt: number;
  color: string;
};

type CapturePulse = {
  id: string;
  startedAt: number;
};

type GameState = {
  cells: LiteCell[];
  cellById: Map<string, LiteCell>;
  players: TableWarsV2Player[];
  currentPlayer: TableWarsV2Player | null;
  isPlayer: boolean;
  isHost: boolean;
  realtimeReady: boolean;
  realtimeStatus: TableWarsRealtimeLiteConnectionStatus;
  role: TableWarsV2Snapshot["role"];
  selectedCellId: string | null;
  movingUnits: MovingUnit[];
  finished: boolean;
  winningTeam: TableWarsTeam | null;
  winnerMessage: string | null;
  lastGrowthAt: number;
  lastAiMoveAtByTeam: Partial<Record<TableWarsTeam, number>>;
  seenEvents: Set<string>;
  ignoredFinishedEvents: Set<string>;
  lastInputDebug: string;
};

const MAX_DPR = 2;
const TOTAL_CELLS = 10;
const BASE_SOLDIERS = 25;
const DEFAULT_SOLDIERS = 10;
const MAX_SOLDIERS = 60;
const MIN_SEND_SOLDIERS = 2;
const GROWTH_INTERVAL_MS = 2_200;
const AI_INTERVAL_MS = 1_700;
const SPARK_MS = 700;
const CAPTURE_PULSE_MS = 900;
const PACKET_TRAIL_DELAY = 0.04;
const BLUE = "#38BDF8";
const RED = "#FB7185";
const NEUTRAL = "#B9A48F";
const GOLD = "#D9A33F";
const TABLE_TOP = "#6B3A25";
const TABLE_EDGE = "#3A2118";
const FLOOR = "#F4E7D7";
const SEAT_NOT_BOUND_MESSAGE = "لم يتم ربط مقعدك بعد، أعد اختيار الفريق";
const TEAM_CELL_CONTROL_MESSAGE = "هذه طاولة فريقك ويمكنك التحكم بها";
const ENEMY_CELL_MESSAGE = "هذه طاولة خصم";
const OTHER_PLAYER_CELL_MESSAGE = "هذه طاولة لاعب آخر";
const DISCONNECTED_CELL_MESSAGE = "هذه طاولة غير متصلة";

const HOME_SLOTS: Record<TableWarsTeam, number[]> = {
  blue: [1, 2],
  red: [9, 10],
};

const TABLE_PATHS: Record<number, number[]> = {
  1: [2, 3],
  2: [1, 4],
  3: [1, 5],
  4: [2, 6],
  5: [3, 7],
  6: [4, 8],
  7: [5, 9],
  8: [6, 10],
  9: [7, 10],
  10: [8, 9],
};

function teamColor(team: TableWarsV2CellTeam) {
  if (team === "blue") return BLUE;
  if (team === "red") return RED;
  return NEUTRAL;
}

function oppositeTeam(team: TableWarsTeam): TableWarsTeam {
  return team === "blue" ? "red" : "blue";
}

function eventId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function winnerMessage(team: TableWarsTeam | null) {
  if (team === "blue") return "فاز الفريق الأزرق";
  if (team === "red") return "فاز الفريق الأحمر";
  return "انتهت الجولة";
}

function homeTeamForSlot(slotIndex: number): TableWarsTeam | null {
  if (HOME_SLOTS.blue.includes(slotIndex)) return "blue";
  if (HOME_SLOTS.red.includes(slotIndex)) return "red";
  return null;
}

function areCellsConnected(from: TableWarsV2Cell, to: TableWarsV2Cell) {
  return Boolean(TABLE_PATHS[from.slotIndex]?.includes(to.slotIndex));
}

function realPlayersForTeam(players: TableWarsV2Player[], team: TableWarsTeam) {
  return players.filter((player) => player.team === team && player.role === "player" && player.customerId);
}

function teamHasRealPlayers(players: TableWarsV2Player[], team: TableWarsTeam) {
  return realPlayersForTeam(players, team).length > 0;
}

function assignedPlayerForCell(players: TableWarsV2Player[], cell: TableWarsV2Cell) {
  if (!cell.assignedPlayerId) return null;
  return players.find((player) => player.id === cell.assignedPlayerId) ?? null;
}

function isBlockingRealPlayer(player: TableWarsV2Player | null) {
  return Boolean(player?.role === "player" && player.customerId && player.isConnected);
}

function hasBlockingRealAssignee(players: TableWarsV2Player[], cell: TableWarsV2Cell, currentPlayerId?: string | null) {
  if (!cell.assignedPlayerId || cell.assignedPlayerId === currentPlayerId) return false;
  const assignee = assignedPlayerForCell(players, cell);
  return isBlockingRealPlayer(assignee);
}

function normalizeCells(cells: TableWarsV2Cell[], players: TableWarsV2Player[]) {
  return cells
    .filter((cell) => cell.slotIndex <= TOTAL_CELLS)
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((cell) => {
      const homeTeam = homeTeamForSlot(cell.slotIndex);
      const hasRealAssignee = isBlockingRealPlayer(assignedPlayerForCell(players, cell));
      const shouldFillOpenHomeSeat =
        Boolean(homeTeam) && !hasRealAssignee && (cell.team === "neutral" || cell.team === homeTeam);
      const team: TableWarsV2CellTeam = shouldFillOpenHomeSeat && homeTeam ? homeTeam : cell.team;
      return {
        ...cell,
        team,
        isBase: cell.isBase || shouldFillOpenHomeSeat,
        soldiers:
          shouldFillOpenHomeSeat && cell.team === "neutral"
            ? BASE_SOLDIERS
            : Math.max(DEFAULT_SOLDIERS, cell.soldiers),
        localUpdatedAt: Date.now(),
      };
    });
}

function makeCellMap(cells: LiteCell[]) {
  return new Map(cells.map((cell) => [cell.id, cell]));
}

function createInitialState(props: Props): GameState {
  const cells = normalizeCells(props.cells, props.players);
  const localWinner = confirmedWinnerFromCells(cells);
  return {
    cells,
    cellById: makeCellMap(cells),
    players: props.players,
    currentPlayer: props.currentPlayer,
    isPlayer: props.isPlayer,
    isHost: props.isHost,
    realtimeReady: props.realtimeReady,
    realtimeStatus: props.realtimeStatus,
    role: props.role,
    selectedCellId: null,
    movingUnits: [],
    finished: props.initialRoundFinished && Boolean(localWinner),
    winningTeam: localWinner,
    winnerMessage: localWinner ? props.initialWinnerMessage ?? winnerMessage(localWinner) : null,
    lastGrowthAt: Date.now(),
    lastAiMoveAtByTeam: {},
    seenEvents: new Set(),
    ignoredFinishedEvents: new Set(),
    lastInputDebug: "آخر ضغطة: لم تضغط بعد",
  };
}

function updateCellMap(state: GameState) {
  state.cellById = makeCellMap(state.cells);
}

function percentToPoint(cell: TableWarsV2Cell, size: Size) {
  return {
    x: (cell.x / 100) * size.width,
    y: (cell.y / 100) * size.height,
  };
}

function tableSize(size: Size) {
  const base = Math.min(size.width, size.height);
  return {
    width: Math.max(60, Math.min(94, base * 0.19)),
    height: Math.max(44, Math.min(66, base * 0.13)),
  };
}

function distanceBetween(from: TableWarsV2Cell, to: TableWarsV2Cell) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function travelMs(from: TableWarsV2Cell, to: TableWarsV2Cell) {
  return Math.round(900 + distanceBetween(from, to) * 14);
}

function unitProgress(unit: MovingUnit, now: number) {
  const raw = Math.min(1, Math.max(0, (now - unit.startedAtMs) / Math.max(1, unit.travelMs)));
  return raw * raw * (3 - 2 * raw);
}

function laneOffset(from: { x: number; y: number }, to: { x: number; y: number }, laneIndex: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const offset = (laneIndex - 1) * 9;
  return {
    x: (-dy / length) * offset,
    y: (dx / length) * offset,
  };
}

function pathPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number,
  offset: { x: number; y: number },
) {
  return {
    x: from.x + (to.x - from.x) * progress + offset.x,
    y: from.y + (to.y - from.y) * progress + offset.y,
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function canCurrentPlayerControl(state: GameState, cell: LiteCell) {
  const player = state.currentPlayer;
  if (!player || player.role !== "player" || state.finished) return false;
  if (cell.team !== player.team) return false;
  const baseCell = currentPlayerBaseCell(state);
  if (cell.id === baseCell?.id || cell.assignedPlayerId === player.id) return true;
  return !hasBlockingRealAssignee(state.players, cell, player.id);
}

function currentPlayerBaseCell(state: GameState) {
  const player = state.currentPlayer;
  if (!player?.id || player.role !== "player") return null;

  const validBase = (cell: LiteCell | undefined) =>
    Boolean(
      cell &&
        cell.team === player.team &&
        cell.isBase &&
        !hasBlockingRealAssignee(state.players, cell, player.id),
    );

  const explicitBase = player.baseCellId ? state.cellById.get(player.baseCellId) : undefined;
  if (validBase(explicitBase)) return explicitBase ?? null;

  return state.cells.find((cell) => validBase(cell) && cell.assignedPlayerId === player.id) ?? null;
}

function currentPlayerSeatProblem(state: GameState) {
  const player = state.currentPlayer;
  if (!player?.id || !player.team) return SEAT_NOT_BOUND_MESSAGE;
  if (player.role !== "player") return SEAT_NOT_BOUND_MESSAGE;
  if (!currentPlayerBaseCell(state)) return SEAT_NOT_BOUND_MESSAGE;
  return null;
}

function controlReason(state: GameState, cell: LiteCell) {
  const seatProblem = currentPlayerSeatProblem(state);
  if (seatProblem) return { ok: false, message: seatProblem };

  const player = state.currentPlayer as TableWarsV2Player;
  if (cell.team !== player.team) return { ok: false, message: ENEMY_CELL_MESSAGE };

  const baseCell = currentPlayerBaseCell(state);
  if (cell.id === baseCell?.id || cell.assignedPlayerId === player.id) {
    return { ok: true, message: TEAM_CELL_CONTROL_MESSAGE };
  }

  const assignee = assignedPlayerForCell(state.players, cell);
  if (cell.assignedPlayerId && isBlockingRealPlayer(assignee) && assignee?.id !== player.id) {
    return { ok: false, message: OTHER_PLAYER_CELL_MESSAGE };
  }

  return { ok: true, message: TEAM_CELL_CONTROL_MESSAGE };
}

function canAiControl(state: GameState, cell: LiteCell, team: TableWarsTeam) {
  if (!state.isHost || state.finished || teamHasRealPlayers(state.players, team) || cell.team !== team) return false;
  return !hasBlockingRealAssignee(state.players, cell, null);
}

function applyMove(state: GameState, event: TableWarsRealtimeLiteMoveEvent) {
  if (state.seenEvents.has(event.eventId)) return false;
  state.seenEvents.add(event.eventId);

  const from = state.cellById.get(event.fromCellId);
  const to = state.cellById.get(event.toCellId);
  if (!from || !to || state.finished) return false;
  if (from.team !== event.team || from.soldiers < MIN_SEND_SOLDIERS) return false;
  if (!areCellsConnected(from, to)) return false;

  const soldiers = Math.max(MIN_SEND_SOLDIERS, Math.min(event.soldiers, Math.floor(from.soldiers / 2)));
  from.soldiers = Math.max(0, from.soldiers - soldiers);
  from.localUpdatedAt = Date.now();
  state.movingUnits.push({
    id: event.eventId,
    fromCellId: event.fromCellId,
    toCellId: event.toCellId,
    team: event.team,
    soldiers,
    startedAtMs: Date.parse(event.startedAt),
    travelMs: event.travelMs,
    laneIndex: 1 + (state.movingUnits.length % 3),
  });
  return true;
}

function emitMove(
  state: GameState,
  type: "player_move" | "ai_move",
  from: LiteCell,
  to: LiteCell,
  soldiers: number,
  onLocalEvent: (event: TableWarsRealtimeLiteEvent) => void | Promise<unknown>,
) {
  if (!areCellsConnected(from, to)) return false;

  const event: TableWarsRealtimeLiteMoveEvent = {
    type,
    eventId: eventId(type),
    fromCellId: from.id,
    toCellId: to.id,
    team: from.team as TableWarsTeam,
    soldiers,
    startedAt: new Date().toISOString(),
    travelMs: travelMs(from, to),
  };
  if (!applyMove(state, event)) return false;
  onLocalEvent(event);
  return true;
}

function resolveArrival(
  state: GameState,
  unit: MovingUnit,
  capturePulses: Map<string, CapturePulse>,
  onLocalEvent: (event: TableWarsRealtimeLiteEvent) => void | Promise<unknown>,
) {
  const target = state.cellById.get(unit.toCellId);
  if (!target) return;

  if (target.team === unit.team) {
    target.soldiers = Math.min(MAX_SOLDIERS, target.soldiers + unit.soldiers);
  } else if (unit.soldiers > target.soldiers) {
    const survivors = unit.soldiers - target.soldiers;
    target.team = unit.team;
    target.assignedPlayerId = target.isBase ? target.assignedPlayerId : null;
    target.soldiers = Math.min(MAX_SOLDIERS, survivors);
    target.localUpdatedAt = Date.now();
    capturePulses.set(target.id, { id: target.id, startedAt: performance.now() });
    if (state.isHost) {
      onLocalEvent({
        type: "capture",
        eventId: eventId("capture"),
        cellId: target.id,
        team: target.team,
        soldiers: target.soldiers,
        occurredAt: new Date().toISOString(),
      });
    }
  } else if (unit.soldiers < target.soldiers) {
    target.soldiers -= unit.soldiers;
  } else {
    target.soldiers = 0;
    if (target.team === "neutral") target.assignedPlayerId = null;
  }

  target.localUpdatedAt = Date.now();
}

function resolveRoadBattles(
  state: GameState,
  size: Size,
  sparks: Spark[],
  onLocalEvent: (event: TableWarsRealtimeLiteEvent) => void | Promise<unknown>,
) {
  const now = Date.now();
  const removed = new Set<string>();

  for (let indexA = 0; indexA < state.movingUnits.length; indexA += 1) {
    const unitA = state.movingUnits[indexA];
    if (!unitA || removed.has(unitA.id)) continue;

    for (let indexB = indexA + 1; indexB < state.movingUnits.length; indexB += 1) {
      const unitB = state.movingUnits[indexB];
      if (!unitB || removed.has(unitB.id)) continue;
      if (unitA.team === unitB.team) continue;
      if (unitA.fromCellId !== unitB.toCellId || unitA.toCellId !== unitB.fromCellId) continue;

      const progressA = unitProgress(unitA, now);
      const progressB = unitProgress(unitB, now);
      if (Math.abs(progressA - (1 - progressB)) > 0.07) continue;

      const from = state.cellById.get(unitA.fromCellId);
      const to = state.cellById.get(unitA.toCellId);
      if (from && to) {
        const fromPoint = percentToPoint(from, size);
        const toPoint = percentToPoint(to, size);
        sparks.push({
          id: eventId("battle-spark"),
          x: (fromPoint.x + toPoint.x) / 2,
          y: (fromPoint.y + toPoint.y) / 2,
          startedAt: performance.now(),
          color: GOLD,
        });
      }

      if (unitA.soldiers > unitB.soldiers) {
        unitA.soldiers -= unitB.soldiers;
        removed.add(unitB.id);
      } else if (unitB.soldiers > unitA.soldiers) {
        unitB.soldiers -= unitA.soldiers;
        removed.add(unitA.id);
      } else {
        removed.add(unitA.id);
        removed.add(unitB.id);
      }

      if (state.isHost) {
        onLocalEvent({
          type: "battle",
          eventId: eventId("battle"),
          fromCellId: unitA.fromCellId,
          toCellId: unitA.toCellId,
          occurredAt: new Date().toISOString(),
        });
      }
      break;
    }
  }

  if (removed.size > 0) {
    state.movingUnits = state.movingUnits.filter((unit) => !removed.has(unit.id));
  }
}

function growCells(state: GameState, now: number) {
  if (now - state.lastGrowthAt < GROWTH_INTERVAL_MS) return;
  state.lastGrowthAt = now;
  for (const cell of state.cells) {
    if (cell.team !== "neutral" && cell.soldiers < MAX_SOLDIERS) {
      cell.soldiers += 1;
    }
  }
}

function confirmedWinnerFromCells(cells: LiteCell[]) {
  if (cells.length !== TOTAL_CELLS) return null;
  if (cells.every((cell) => cell.team === "blue")) return "blue";
  if (cells.every((cell) => cell.team === "red")) return "red";
  return null;
}

function checkWinner(state: GameState) {
  if (state.finished) return null;
  return confirmedWinnerFromCells(state.cells);
}

function chooseAiMove(state: GameState, team: TableWarsTeam, now: number) {
  if (!state.isHost || state.finished || teamHasRealPlayers(state.players, team)) return null;
  const lastMoveAt = state.lastAiMoveAtByTeam[team] ?? 0;
  if (now - lastMoveAt < AI_INTERVAL_MS + (team === "red" ? 450 : 0)) return null;

  const sources = state.cells
    .filter((cell) => canAiControl(state, cell, team) && cell.soldiers >= 8)
    .sort((a, b) => b.soldiers - a.soldiers || a.slotIndex - b.slotIndex);
  const source = sources[0];
  if (!source) return null;

  const connectedTargets = state.cells.filter((cell) => cell.id !== source.id && areCellsConnected(source, cell));
  const weakTargetSort = (a: LiteCell, b: LiteCell) =>
    a.soldiers - b.soldiers || distanceBetween(source, a) - distanceBetween(source, b);
  const target =
    connectedTargets
      .filter((cell) => cell.team === "neutral")
      .sort(weakTargetSort)[0] ??
    connectedTargets
      .filter((cell) => cell.team !== team && cell.team !== "neutral")
      .sort(weakTargetSort)[0] ??
    connectedTargets
      .filter((cell) => cell.team === team && cell.soldiers < source.soldiers && cell.soldiers < 18)
      .sort(weakTargetSort)[0];
  if (!target) return null;

  state.lastAiMoveAtByTeam[team] = now;
  return {
    source,
    target,
    soldiers: Math.max(MIN_SEND_SOLDIERS, Math.floor(source.soldiers / 2)),
  };
}

function applyExternalEvent(
  state: GameState,
  event: TableWarsRealtimeLiteEvent,
  capturePulses: Map<string, CapturePulse>,
  sparks: Spark[],
  size: Size,
) {
  if (event.type === "player_move" || event.type === "ai_move") {
    applyMove(state, event);
    return;
  }
  if (state.seenEvents.has(event.eventId)) return;
  state.seenEvents.add(event.eventId);

  if (event.type === "capture") {
    const cell = state.cellById.get(event.cellId);
    if (!cell) return;
    cell.team = event.team;
    cell.soldiers = event.soldiers;
    cell.localUpdatedAt = Date.now();
    capturePulses.set(cell.id, { id: cell.id, startedAt: performance.now() });
    return;
  }
  if (event.type === "battle") {
    const from = state.cellById.get(event.fromCellId);
    const to = state.cellById.get(event.toCellId);
    if (!from || !to) return;
    const fromPoint = percentToPoint(from, size);
    const toPoint = percentToPoint(to, size);
    sparks.push({
      id: event.eventId,
      x: (fromPoint.x + toPoint.x) / 2,
      y: (fromPoint.y + toPoint.y) / 2,
      startedAt: performance.now(),
      color: GOLD,
    });
    return;
  }
  if (event.type === "round_finished") {
    const localWinner = confirmedWinnerFromCells(state.cells);
    if (localWinner !== event.winningTeam) {
      state.ignoredFinishedEvents.add(event.eventId);
      return;
    }
    state.finished = true;
    state.winningTeam = event.winningTeam;
    state.winnerMessage = winnerMessage(event.winningTeam);
    return;
  }
  if (event.type === "round_reset") {
    resetLocalRound(state);
  }
}

function resetLocalRound(state: GameState) {
  const resetCells = normalizeCells(state.cells, state.players).map((cell) => {
    const homeTeam = homeTeamForSlot(cell.slotIndex);
    const isRealBase = state.players.some((player) => player.baseCellId === cell.id && player.role === "player");
    const nextTeam: TableWarsV2CellTeam = homeTeam ?? "neutral";
    return {
      ...cell,
      team: nextTeam,
      isBase: Boolean(homeTeam) || isRealBase,
      assignedPlayerId: isRealBase ? cell.assignedPlayerId : null,
      soldiers: homeTeam ? BASE_SOLDIERS : DEFAULT_SOLDIERS,
      localUpdatedAt: Date.now(),
    };
  });

  state.cells = resetCells;
  state.cellById = makeCellMap(resetCells);
  state.selectedCellId = null;
  state.movingUnits = [];
  state.finished = false;
  state.winningTeam = null;
  state.winnerMessage = null;
  state.lastGrowthAt = Date.now();
  state.lastAiMoveAtByTeam = {};
  state.seenEvents = new Set();
  state.ignoredFinishedEvents = new Set();
  state.lastInputDebug = "آخر ضغطة: بدأت جولة جديدة";
}

function drawBackground(ctx: CanvasRenderingContext2D, size: Size) {
  const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
  gradient.addColorStop(0, "#FBF4EA");
  gradient.addColorStop(0.58, FLOOR);
  gradient.addColorStop(1, "#EFE0CF");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size.width, size.height);

  ctx.save();
  ctx.fillStyle = "rgba(255,253,249,0.34)";
  ctx.fillRect(size.width * 0.04, size.height * 0.05, size.width * 0.92, size.height * 0.9);
  ctx.strokeStyle = "rgba(107,58,37,0.08)";
  ctx.lineWidth = 1;
  roundRect(ctx, size.width * 0.04, size.height * 0.05, size.width * 0.92, size.height * 0.9, 20);
  ctx.stroke();
  ctx.restore();
}

function drawMovement(ctx: CanvasRenderingContext2D, state: GameState, size: Size, now: number) {
  for (const unit of state.movingUnits) {
    const fromCell = state.cellById.get(unit.fromCellId);
    const toCell = state.cellById.get(unit.toCellId);
    if (!fromCell || !toCell) continue;

    const from = percentToPoint(fromCell, size);
    const to = percentToPoint(toCell, size);
    const offset = laneOffset(from, to, unit.laneIndex);
    const color = teamColor(unit.team);
    const progress = unitProgress(unit, now);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 10]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x + offset.x, from.y + offset.y);
    ctx.lineTo(to.x + offset.x, to.y + offset.y);
    ctx.stroke();
    ctx.restore();

    const packetCount = Math.min(12, Math.max(4, Math.ceil(unit.soldiers / 4)));
    for (let index = 0; index < packetCount; index += 1) {
      const packetProgress = progress - index * PACKET_TRAIL_DELAY;
      if (packetProgress <= 0 || packetProgress >= 1) continue;
      const jitter = ((index % 3) - 1) * 2.2;
      const point = pathPoint(from, to, packetProgress, { x: offset.x + jitter, y: offset.y - jitter });
      const radius = index === 0 ? 5 : 4;

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.beginPath();
      ctx.arc(point.x - radius * 0.28, point.y - radius * 0.28, radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawPathCurve(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  bend: number,
) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const control = {
    x: midX + (-dy / length) * bend,
    y: midY + (dx / length) * bend,
  };

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(control.x, control.y, to.x, to.y);
}

function drawPaths(ctx: CanvasRenderingContext2D, state: GameState, size: Size, now: number) {
  const selectedSource = state.selectedCellId ? state.cellById.get(state.selectedCellId) ?? null : null;
  if (!selectedSource) return;

  const sourceReason = controlReason(state, selectedSource);
  if (!sourceReason.ok || selectedSource.team !== state.currentPlayer?.team || selectedSource.soldiers < MIN_SEND_SOLDIERS) {
    return;
  }

  const cellsBySlot = new Map(state.cells.map((cell) => [cell.slotIndex, cell]));
  const pulse = 0.5 + Math.sin(now / 180) * 0.5;

  for (const targetSlot of TABLE_PATHS[selectedSource.slotIndex] ?? []) {
    const toCell = cellsBySlot.get(targetSlot);
    if (!toCell || !areCellsConnected(selectedSource, toCell)) continue;

    const from = percentToPoint(selectedSource, size);
    const to = percentToPoint(toCell, size);
    const bend = ((selectedSource.slotIndex + targetSlot) % 2 === 0 ? 1 : -1) * Math.min(18, size.width * 0.035);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = `rgba(217,163,63,${0.34 + pulse * 0.22})`;
    ctx.lineWidth = 10;
    drawPathCurve(ctx, from, to, bend);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,253,249,0.82)";
    ctx.lineWidth = 3;
    drawPathCurve(ctx, from, to, bend);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTable(
  ctx: CanvasRenderingContext2D,
  cell: LiteCell,
  state: GameState,
  size: Size,
  now: number,
  capturePulses: Map<string, CapturePulse>,
) {
  const point = percentToPoint(cell, size);
  const dimensions = tableSize(size);
  const selected = state.selectedCellId === cell.id;
  const controlled = canCurrentPlayerControl(state, cell);
  const color = teamColor(cell.team);
  const isOwnBase =
    state.currentPlayer?.role === "player" &&
    state.currentPlayer?.team === cell.team &&
    currentPlayerBaseCell(state)?.id === cell.id;
  const selectedSource = state.selectedCellId ? state.cellById.get(state.selectedCellId) ?? null : null;
  const connectedToSelected = Boolean(selectedSource && selectedSource.id !== cell.id && areCellsConnected(selectedSource, cell));
  const targetPreview = connectedToSelected;
  const baseAlpha = selectedSource && !selected && !connectedToSelected ? 0.44 : 1;
  const pulse = 0.5 + Math.sin(now / 150) * 0.5;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.globalAlpha = baseAlpha;
  ctx.shadowColor = cell.team === "blue" ? "rgba(56,189,248,0.38)" : cell.team === "red" ? "rgba(251,113,133,0.34)" : "rgba(107,58,37,0.14)";
  ctx.shadowBlur = selected ? 28 : 18;
  ctx.fillStyle = ctx.shadowColor;
  ctx.beginPath();
  ctx.ellipse(0, dimensions.height * 0.14, dimensions.width * 0.82, dimensions.height * 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (selected || targetPreview) {
    ctx.strokeStyle = selected ? GOLD : "rgba(255,255,255,0.86)";
    ctx.globalAlpha = selected ? 0.58 + pulse * 0.34 : 0.8;
    ctx.lineWidth = selected ? 5 : 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, dimensions.width * 0.82 + (selected ? pulse * 8 : 0), dimensions.height * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = baseAlpha;
  }

  const capture = capturePulses.get(cell.id);
  if (capture) {
    const progress = Math.min(1, (performance.now() - capture.startedAt) / CAPTURE_PULSE_MS);
    ctx.strokeStyle = GOLD;
    ctx.globalAlpha = 1 - progress;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, dimensions.width * (0.78 + progress * 0.45), dimensions.height * (0.78 + progress * 0.5), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = baseAlpha;
  }

  drawChair(ctx, -dimensions.width * 0.54, -dimensions.height * 0.16, dimensions, color);
  drawChair(ctx, dimensions.width * 0.54, -dimensions.height * 0.16, dimensions, color);
  drawChair(ctx, -dimensions.width * 0.3, dimensions.height * 0.58, dimensions, color);
  drawChair(ctx, dimensions.width * 0.3, dimensions.height * 0.58, dimensions, color);

  ctx.fillStyle = TABLE_EDGE;
  roundRect(ctx, -dimensions.width * 0.5, -dimensions.height * 0.34, dimensions.width, dimensions.height * 0.78, 14);
  ctx.fill();

  const topGradient = ctx.createLinearGradient(0, -dimensions.height * 0.38, 0, dimensions.height * 0.42);
  topGradient.addColorStop(0, "#8B5737");
  topGradient.addColorStop(1, TABLE_TOP);
  ctx.fillStyle = topGradient;
  roundRect(ctx, -dimensions.width * 0.45, -dimensions.height * 0.38, dimensions.width * 0.9, dimensions.height * 0.72, 12);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = cell.team === "neutral" ? 3 : 5;
  roundRect(ctx, -dimensions.width * 0.45, -dimensions.height * 0.38, dimensions.width * 0.9, dimensions.height * 0.72, 12);
  ctx.stroke();

  if (cell.isBase) drawCastleCrown(ctx, dimensions, color);
  if (controlled) drawControlMarker(ctx, dimensions);

  ctx.fillStyle = "#FFFDF9";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.max(18, dimensions.height * 0.46)}px Arial`;
  ctx.fillText(String(cell.soldiers), 0, -1);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `900 ${Math.max(9, dimensions.height * 0.22)}px Arial`;
  ctx.fillText(String(cell.slotIndex), 0, dimensions.height * 0.24);

  if (isOwnBase && state.currentPlayer?.displayName) {
    drawNameTag(ctx, state.currentPlayer.displayName, dimensions);
  }

  ctx.restore();
}

function drawChair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dimensions: { width: number; height: number },
  color: string,
) {
  ctx.save();
  ctx.fillStyle = "#C9A17A";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  roundRect(ctx, x - dimensions.width * 0.1, y - dimensions.height * 0.12, dimensions.width * 0.2, dimensions.height * 0.24, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCastleCrown(
  ctx: CanvasRenderingContext2D,
  dimensions: { width: number; height: number },
  color: string,
) {
  const top = -dimensions.height * 0.64;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#FFFDF9";
  ctx.lineWidth = 1.5;
  for (let index = -1; index <= 1; index += 1) {
    roundRect(ctx, index * dimensions.width * 0.15 - 5, top, 10, 14, 3);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(dimensions.width * 0.23, top - 1);
  ctx.lineTo(dimensions.width * 0.42, top + 5);
  ctx.lineTo(dimensions.width * 0.23, top + 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawControlMarker(ctx: CanvasRenderingContext2D, dimensions: { width: number; height: number }) {
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(-dimensions.width * 0.48, -dimensions.height * 0.54);
  ctx.lineTo(-dimensions.width * 0.33, -dimensions.height * 0.66);
  ctx.lineTo(-dimensions.width * 0.18, -dimensions.height * 0.54);
  ctx.lineTo(-dimensions.width * 0.33, -dimensions.height * 0.42);
  ctx.closePath();
  ctx.fill();
}

function drawNameTag(ctx: CanvasRenderingContext2D, name: string, dimensions: { width: number; height: number }) {
  const label = name.length > 14 ? `${name.slice(0, 13)}...` : name;
  const width = Math.min(128, Math.max(72, label.length * 8));
  const y = -dimensions.height * 1.08;
  ctx.save();
  ctx.fillStyle = "rgba(255,253,249,0.94)";
  ctx.strokeStyle = "rgba(107,58,37,0.18)";
  ctx.lineWidth = 1;
  roundRect(ctx, -width / 2, y - 12, width, 24, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#311912";
  ctx.font = "900 11px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, y);
  ctx.restore();
}

function drawSparks(ctx: CanvasRenderingContext2D, sparks: Spark[], now: number) {
  for (const spark of sparks) {
    const progress = Math.min(1, (now - spark.startedAt) / SPARK_MS);
    if (progress >= 1) continue;
    ctx.save();
    ctx.translate(spark.x, spark.y);
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = spark.color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let index = 0; index < 9; index += 1) {
      const angle = (Math.PI * 2 * index) / 9 + progress * 1.2;
      const inner = 8 + progress * 8;
      const outer = 20 + progress * 22;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(0, 0, 8 + progress * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function winnerButtonRect(size: Size) {
  const cardHeight = 178;
  const width = Math.min(size.width - 76, 260);
  const height = 42;
  return {
    x: (size.width - width) / 2,
    y: (size.height - cardHeight) / 2 + 120,
    width,
    height,
  };
}

function isPointInsideRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function drawWinnerBanner(ctx: CanvasRenderingContext2D, size: Size, message: string | null) {
  ctx.save();
  ctx.fillStyle = "rgba(49,25,18,0.54)";
  ctx.fillRect(0, 0, size.width, size.height);
  const cardWidth = Math.min(size.width - 36, 360);
  const cardHeight = 178;
  const x = (size.width - cardWidth) / 2;
  const y = (size.height - cardHeight) / 2;
  ctx.shadowColor = "rgba(49,25,18,0.28)";
  ctx.shadowBlur = 32;
  ctx.fillStyle = "#FFFDF9";
  roundRect(ctx, x, y, cardWidth, cardHeight, 18);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(size.width / 2, y + 36, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#311912";
  ctx.font = "900 24px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message ?? "انتهت الجولة", size.width / 2, y + 78);
  ctx.fillStyle = "#806A5E";
  ctx.font = "800 14px Arial";
  ctx.fillText("انتهت الجولة", size.width / 2, y + 110);

  const button = winnerButtonRect(size);
  ctx.fillStyle = "#311912";
  roundRect(ctx, button.x, button.y, button.width, button.height, 12);
  ctx.fill();
  ctx.fillStyle = "#FFFDF9";
  ctx.font = "900 14px Arial";
  ctx.fillText("بدء جولة جديدة", size.width / 2, button.y + button.height / 2);
  ctx.restore();
}

function drawStatusChip(ctx: CanvasRenderingContext2D, size: Size, state: GameState) {
  ctx.save();
  const label =
    state.realtimeStatus === "connected"
      ? "متصل"
      : state.realtimeStatus === "connecting"
        ? "جاري الاتصال"
        : "المزامنة غير مستقرة";
  const width = state.realtimeStatus === "connected" ? 104 : state.realtimeStatus === "connecting" ? 136 : 172;
  const x = size.width - width - 16;
  const y = 16;
  ctx.fillStyle =
    state.realtimeStatus === "connected"
      ? "rgba(236,253,245,0.94)"
      : state.realtimeStatus === "connecting"
        ? "rgba(255,247,227,0.94)"
        : "rgba(255,241,242,0.94)";
  ctx.strokeStyle =
    state.realtimeStatus === "connected"
      ? "rgba(16,185,129,0.34)"
      : state.realtimeStatus === "connecting"
        ? "rgba(217,163,63,0.38)"
        : "rgba(251,113,133,0.36)";
  roundRect(ctx, x, y, width, 34, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle =
    state.realtimeStatus === "connected" ? "#047857" : state.realtimeStatus === "connecting" ? "#6B3A25" : "#9F1239";
  ctx.font = "900 13px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + width / 2, y + 17);
  ctx.restore();
}

function drawInputDebug(ctx: CanvasRenderingContext2D, size: Size, state: GameState) {
  const label = state.lastInputDebug;
  const width = Math.min(size.width - 32, Math.max(220, label.length * 8.4));
  const height = 32;
  const x = 16;
  const y = size.height - height - 16;

  ctx.save();
  ctx.fillStyle = "rgba(49,25,18,0.72)";
  ctx.strokeStyle = "rgba(255,253,249,0.32)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#FFFDF9";
  ctx.font = "800 12px Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + width - 12, y + height / 2);
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  size: Size,
  now: number,
  sparks: Spark[],
  capturePulses: Map<string, CapturePulse>,
) {
  drawBackground(ctx, size);
  drawPaths(ctx, state, size, now);
  drawMovement(ctx, state, size, now);
  const sortedCells = [...state.cells].sort((a, b) => a.y - b.y || a.slotIndex - b.slotIndex);
  for (const cell of sortedCells) {
    drawTable(ctx, cell, state, size, now, capturePulses);
  }
  drawSparks(ctx, sparks, performance.now());
  drawStatusChip(ctx, size, state);
  drawInputDebug(ctx, size, state);
  if (state.finished) drawWinnerBanner(ctx, size, state.winnerMessage);
}

function nearestCellAt(point: { x: number; y: number }, cells: LiteCell[], size: Size) {
  const dimensions = tableSize(size);
  const hitRadius = Math.max(52, Math.min(72, Math.max(dimensions.width, dimensions.height) * 0.72));
  let nearest: { cell: LiteCell; distance: number } | null = null;
  for (const cell of cells) {
    const center = percentToPoint(cell, size);
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (distance > hitRadius) continue;
    if (!nearest || distance < nearest.distance) nearest = { cell, distance };
  }
  return nearest?.cell ?? null;
}

export const TableWarsCanvasGame = memo(function TableWarsCanvasGame({
  onLocalEvent,
  onRoundFinished,
  onNewRound,
  onMessage,
  ...props
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<GameState>(createInitialState({ ...props, onLocalEvent, onRoundFinished, onNewRound, onMessage }));
  const sizeRef = useRef<Size>({ width: 0, height: 0, dpr: 1 });
  const sparksRef = useRef<Spark[]>([]);
  const capturePulsesRef = useRef<Map<string, CapturePulse>>(new Map());
  const onLocalEventRef = useRef(onLocalEvent);
  const onRoundFinishedRef = useRef(onRoundFinished);
  const onNewRoundRef = useRef(onNewRound);
  const onMessageRef = useRef(onMessage);
  const lastPointerDownAtRef = useRef(0);
  const externalEventsKey = useMemo(
    () => props.externalEvents.map((event) => event.eventId).join("|"),
    [props.externalEvents],
  );

  useEffect(() => {
    onLocalEventRef.current = onLocalEvent;
    onRoundFinishedRef.current = onRoundFinished;
    onNewRoundRef.current = onNewRound;
    onMessageRef.current = onMessage;
  }, [onLocalEvent, onRoundFinished, onNewRound, onMessage]);

  useEffect(() => {
    const state = stateRef.current;
    const normalizedCells = normalizeCells(props.cells, props.players);
    state.cells = normalizedCells;
    state.cellById = makeCellMap(normalizedCells);
    state.players = props.players;
    state.currentPlayer = props.currentPlayer;
    state.isPlayer = props.isPlayer;
    state.isHost = props.isHost;
    state.role = props.role;
    const localWinner = confirmedWinnerFromCells(normalizedCells);
    if (props.initialRoundFinished && localWinner) {
      state.finished = true;
      state.winningTeam = localWinner;
      state.winnerMessage = props.initialWinnerMessage ?? winnerMessage(localWinner);
    } else if (props.initialRoundFinished && !localWinner) {
      state.finished = false;
      state.winningTeam = null;
      state.winnerMessage = null;
    }
    state.selectedCellId = state.selectedCellId && state.cellById.has(state.selectedCellId) ? state.selectedCellId : null;
  }, [
    props.cells,
    props.players,
    props.currentPlayer,
    props.isPlayer,
    props.isHost,
    props.role,
    props.initialRoundFinished,
    props.initialWinnerMessage,
  ]);

  useEffect(() => {
    const state = stateRef.current;
    state.realtimeReady = props.realtimeReady;
    state.realtimeStatus = props.realtimeStatus;
  }, [props.realtimeReady, props.realtimeStatus]);

  useEffect(() => {
    const state = stateRef.current;
    for (const event of props.externalEvents) {
      applyExternalEvent(state, event, capturePulsesRef.current, sparksRef.current, sizeRef.current);
    }
  }, [externalEventsKey, props.externalEvents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const canvasElement = canvas;
    const containerElement = container;

    function resize() {
      const rect = containerElement.getBoundingClientRect();
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      sizeRef.current = {
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        dpr,
      };
      canvasElement.width = Math.floor(sizeRef.current.width * dpr);
      canvasElement.height = Math.floor(sizeRef.current.height * dpr);
      canvasElement.style.width = `${sizeRef.current.width}px`;
      canvasElement.style.height = `${sizeRef.current.height}px`;
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(containerElement);
    window.addEventListener("orientationchange", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", resize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;
    let frameId = 0;

    function frame() {
      const ctx = canvasElement.getContext("2d");
      if (!ctx) return;

      const now = Date.now();
      const state = stateRef.current;
      const size = sizeRef.current;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);

      growCells(state, now);
      resolveRoadBattles(state, size, sparksRef.current, onLocalEventRef.current);

      const arrivedUnits = state.movingUnits.filter((unit) => now - unit.startedAtMs >= unit.travelMs);
      if (arrivedUnits.length > 0) {
        state.movingUnits = state.movingUnits.filter((unit) => now - unit.startedAtMs < unit.travelMs);
        for (const unit of arrivedUnits) {
          resolveArrival(state, unit, capturePulsesRef.current, onLocalEventRef.current);
        }
      }

      for (const team of ["blue", "red"] as const) {
        const aiMove = chooseAiMove(state, team, now);
        if (aiMove) {
          emitMove(state, "ai_move", aiMove.source, aiMove.target, aiMove.soldiers, onLocalEventRef.current);
        }
      }

      const winningTeam = checkWinner(state);
      if (winningTeam) {
        state.finished = true;
        state.winningTeam = winningTeam;
        state.winnerMessage = winnerMessage(winningTeam);
        if (state.isHost) {
          const event: TableWarsRealtimeLiteEvent = {
            type: "round_finished",
            eventId: eventId("round-finished"),
            winningTeam,
            occurredAt: new Date().toISOString(),
          };
          onLocalEventRef.current(event);
          onRoundFinishedRef.current(winningTeam);
        }
      }

      sparksRef.current = sparksRef.current.filter((spark) => performance.now() - spark.startedAt < SPARK_MS);
      for (const [id, pulse] of capturePulsesRef.current.entries()) {
        if (performance.now() - pulse.startedAt >= CAPTURE_PULSE_MS) capturePulsesRef.current.delete(id);
      }

      updateCellMap(state);
      drawScene(ctx, state, size, now, sparksRef.current, capturePulsesRef.current);
      frameId = window.requestAnimationFrame(frame);
    }

    frameId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function canvasPointFromClient(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const logicalSize =
      sizeRef.current.width > 0 && sizeRef.current.height > 0
        ? sizeRef.current
        : { width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr: 1 };
    sizeRef.current = logicalSize;
    return {
      point: {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * logicalSize.width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * logicalSize.height,
      },
      size: logicalSize,
    };
  }

  function noteInput(debugMessage: string, userMessage?: string) {
    stateRef.current.lastInputDebug = debugMessage;
    onMessageRef.current(userMessage ?? debugMessage.replace(/^آخر ضغطة:\s*/, ""));
  }

  function handleCanvasPress(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const state = stateRef.current;
    const { point, size } = canvasPointFromClient(canvas, clientX, clientY);
    const pointLabel = `${Math.round(point.x)},${Math.round(point.y)}`;

    if (state.finished) {
      if (isPointInsideRect(point, winnerButtonRect(size))) {
        resetLocalRound(state);
        capturePulsesRef.current.clear();
        sparksRef.current = [];
        const resetEvent: TableWarsRealtimeLiteEvent = {
          type: "round_reset",
          eventId: eventId("round-reset"),
          resetAt: new Date().toISOString(),
        };
        onLocalEventRef.current(resetEvent);
        onNewRoundRef.current();
        noteInput("آخر ضغطة: بدأت جولة جديدة");
      } else {
        state.lastInputDebug = `آخر ضغطة: ${pointLabel} — الجولة منتهية`;
      }
      return;
    }

    const seatProblem = currentPlayerSeatProblem(state);
    if (seatProblem) {
      noteInput(`آخر ضغطة: ${pointLabel} — ${seatProblem}`, seatProblem);
      return;
    }

    const cell = nearestCellAt(point, state.cells, size);
    if (!cell) {
      noteInput(`آخر ضغطة: ${pointLabel} — لم تصب طاولة`, "اختر طاولة من فريقك أولًا");
      return;
    }

    if (!state.selectedCellId) {
      const reason = controlReason(state, cell);
      if (!reason.ok) {
        noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — ${reason.message}`, reason.message);
        return;
      }
      if (cell.soldiers < MIN_SEND_SOLDIERS) {
        noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — تحتاج الطاولة إلى جنديين على الأقل.`);
        return;
      }
      state.selectedCellId = cell.id;
      noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — ${reason.message}`, "اختر طاولة متصلة كهدف.");
      return;
    }

    if (state.selectedCellId === cell.id) {
      state.selectedCellId = null;
      noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — تم إلغاء الاختيار.`);
      return;
    }

    const source = state.cellById.get(state.selectedCellId);
    if (!source) {
      state.selectedCellId = null;
      noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — اختر مصدرًا صالحًا.`);
      return;
    }

    const sourceReason = controlReason(state, source);
    if (!sourceReason.ok) {
      state.selectedCellId = null;
      noteInput(`آخر ضغطة: طاولة ${source.slotIndex} — ${sourceReason.message}`, sourceReason.message);
      return;
    }

    if (source.team !== state.currentPlayer?.team) {
      state.selectedCellId = null;
      noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — اختر مصدرًا صالحًا.`);
      return;
    }

    if (source.soldiers < MIN_SEND_SOLDIERS) {
      state.selectedCellId = null;
      noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — تحتاج الطاولة إلى جنديين على الأقل.`);
      return;
    }

    const soldiers = Math.max(MIN_SEND_SOLDIERS, Math.floor(source.soldiers / 2));
    if (!areCellsConnected(source, cell)) {
      noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — ${DISCONNECTED_CELL_MESSAGE}`, DISCONNECTED_CELL_MESSAGE);
      return;
    }
    const didSend = emitMove(state, "player_move", source, cell, soldiers, onLocalEventRef.current);
    if (!didSend) {
      noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — لا يمكن إرسال الجنود عبر هذا المسار.`);
      return;
    }
    state.selectedCellId = null;
    noteInput(`آخر ضغطة: طاولة ${cell.slotIndex} — ${cell.team === source.team ? "الدعم في الطريق." : "الهجوم في الطريق."}`);
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    lastPointerDownAtRef.current = Date.now();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail for synthetic or already-ended events.
    }
    handleCanvasPress(event.currentTarget, event.clientX, event.clientY);
  }

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    if (Date.now() - lastPointerDownAtRef.current < 450) return;
    handleCanvasPress(event.currentTarget, event.clientX, event.clientY);
  }

  return (
    <div ref={containerRef} className="relative h-[76dvh] min-h-[560px] max-h-[680px] overflow-hidden bg-[#F4E7D7]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none select-none pointer-events-auto"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        aria-label="خريطة حرب الطاولات"
      />
    </div>
  );
});
