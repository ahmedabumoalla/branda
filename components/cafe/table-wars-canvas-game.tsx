"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type {
  TableWarsV2Cell,
  TableWarsV2Event,
  TableWarsV2Player,
  TableWarsV2Snapshot,
  TableWarsV2Unit,
} from "@/lib/table-wars/v2-types";

type Props = {
  cells: TableWarsV2Cell[];
  units: TableWarsV2Unit[];
  events: TableWarsV2Event[];
  selectedCellId: string | null;
  controlledCellIds: string[];
  capturedCellIds: string[];
  currentPlayer: TableWarsV2Player | null;
  isPlayer: boolean;
  isSending: boolean;
  isRoundFinished: boolean;
  winnerMessage: string | null;
  role: TableWarsV2Snapshot["role"];
  onCellClick: (cell: TableWarsV2Cell) => void;
};

type Size = {
  width: number;
  height: number;
  dpr: number;
};

type GameState = Omit<Props, "onCellClick"> & {
  controlledCellSet: Set<string>;
  capturedCellSet: Set<string>;
  cellById: Map<string, TableWarsV2Cell>;
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

const MAX_DPR = 2;
const POLISH_GOLD = "#D9A33F";
const BLUE = "#38BDF8";
const RED = "#FB7185";
const NEUTRAL = "#B9A48F";
const TABLE_TOP = "#6B3A25";
const TABLE_EDGE = "#3A2118";
const FLOOR = "#F4E7D7";
const PACKET_TRAIL_DELAY = 0.038;
const CAPTURE_PULSE_MS = 900;
const SPARK_MS = 700;

function teamColor(team: TableWarsV2Cell["team"] | TableWarsV2Unit["team"]) {
  if (team === "blue") return BLUE;
  if (team === "red") return RED;
  return NEUTRAL;
}

function teamShadow(team: TableWarsV2Cell["team"]) {
  if (team === "blue") return "rgba(56,189,248,0.38)";
  if (team === "red") return "rgba(251,113,133,0.34)";
  return "rgba(107,58,37,0.14)";
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
    width: Math.max(54, Math.min(82, base * 0.15)),
    height: Math.max(40, Math.min(58, base * 0.105)),
  };
}

function unitProgress(unit: TableWarsV2Unit, now: number) {
  const startedAt = unit.startedAt ? Date.parse(unit.startedAt) : now;
  const arrivesAt = unit.arrivesAt ? Date.parse(unit.arrivesAt) : startedAt + 1;
  const duration = Math.max(1, arrivesAt - startedAt);
  const raw = Math.min(1, Math.max(0, (now - startedAt) / duration));
  return raw * raw * (3 - 2 * raw);
}

function laneOffset(from: { x: number; y: number }, to: { x: number; y: number }, unit: TableWarsV2Unit) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const offset = (unit.laneIndex - 1) * 8;
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

function drawBackground(ctx: CanvasRenderingContext2D, size: Size) {
  const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
  gradient.addColorStop(0, "#FAF2E8");
  gradient.addColorStop(0.48, FLOOR);
  gradient.addColorStop(1, "#EBDAC8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size.width, size.height);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#B9906F";
  ctx.lineWidth = 1;
  const tile = Math.max(34, size.width / 9);
  for (let x = -tile; x < size.width + tile; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + size.height * 0.28, size.height);
    ctx.stroke();
  }
  for (let y = 0; y < size.height; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size.width, y - size.width * 0.28);
    ctx.stroke();
  }
  ctx.restore();

  drawZoneGlow(ctx, size.width * 0.18, size.height * 0.28, size.width * 0.44, "rgba(56,189,248,0.16)");
  drawZoneGlow(ctx, size.width * 0.82, size.height * 0.72, size.width * 0.46, "rgba(251,113,133,0.14)");

  ctx.save();
  ctx.strokeStyle = "rgba(107,58,37,0.18)";
  ctx.lineWidth = Math.max(4, size.width * 0.01);
  ctx.setLineDash([8, 14]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(size.width * 0.12, size.height * 0.62);
  ctx.bezierCurveTo(size.width * 0.32, size.height * 0.45, size.width * 0.36, size.height * 0.76, size.width * 0.52, size.height * 0.56);
  ctx.bezierCurveTo(size.width * 0.66, size.height * 0.38, size.width * 0.75, size.height * 0.42, size.width * 0.9, size.height * 0.58);
  ctx.stroke();
  ctx.restore();
}

function drawZoneGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawMovement(ctx: CanvasRenderingContext2D, state: GameState, size: Size, now: number) {
  for (const unit of state.units) {
    const fromCell = state.cellById.get(unit.fromCellId);
    const toCell = state.cellById.get(unit.toCellId);
    if (!fromCell || !toCell) continue;

    const from = percentToPoint(fromCell, size);
    const to = percentToPoint(toCell, size);
    const offset = laneOffset(from, to, unit);
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

function drawTable(
  ctx: CanvasRenderingContext2D,
  cell: TableWarsV2Cell,
  state: GameState,
  size: Size,
  now: number,
  capturePulses: Map<string, CapturePulse>,
) {
  const point = percentToPoint(cell, size);
  const dimensions = tableSize(size);
  const selected = state.selectedCellId === cell.id;
  const controlled = state.controlledCellSet.has(cell.id);
  const color = teamColor(cell.team);
  const aura = teamShadow(cell.team);
  const isOwnBase = state.currentPlayer?.baseCellId === cell.id && cell.assignedPlayerId === state.currentPlayer.id;
  const isTargetPreview = Boolean(state.selectedCellId && state.selectedCellId !== cell.id);
  const pulse = 0.5 + Math.sin(now / 150) * 0.5;

  ctx.save();
  ctx.translate(point.x, point.y);

  ctx.shadowColor = aura;
  ctx.shadowBlur = selected ? 26 : 18;
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.ellipse(0, dimensions.height * 0.14, dimensions.width * 0.78, dimensions.height * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (selected) {
    ctx.strokeStyle = POLISH_GOLD;
    ctx.globalAlpha = 0.52 + pulse * 0.34;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, dimensions.width * 0.78 + pulse * 8, dimensions.height * 0.75 + pulse * 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (isTargetPreview) {
    ctx.strokeStyle = "rgba(255,255,255,0.84)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, dimensions.width * 0.72, dimensions.height * 0.68, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const capture = capturePulses.get(cell.id);
  if (capture) {
    const progress = Math.min(1, (now - capture.startedAt) / CAPTURE_PULSE_MS);
    ctx.strokeStyle = POLISH_GOLD;
    ctx.globalAlpha = 1 - progress;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, dimensions.width * (0.78 + progress * 0.45), dimensions.height * (0.78 + progress * 0.5), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawChair(ctx, -dimensions.width * 0.52, -dimensions.height * 0.16, dimensions, color);
  drawChair(ctx, dimensions.width * 0.52, -dimensions.height * 0.16, dimensions, color);
  drawChair(ctx, -dimensions.width * 0.28, dimensions.height * 0.58, dimensions, color);
  drawChair(ctx, dimensions.width * 0.28, dimensions.height * 0.58, dimensions, color);

  ctx.fillStyle = TABLE_EDGE;
  roundRect(ctx, -dimensions.width * 0.48, -dimensions.height * 0.34, dimensions.width * 0.96, dimensions.height * 0.76, 14);
  ctx.fill();

  const topGradient = ctx.createLinearGradient(0, -dimensions.height * 0.38, 0, dimensions.height * 0.42);
  topGradient.addColorStop(0, "#8B5737");
  topGradient.addColorStop(1, TABLE_TOP);
  ctx.fillStyle = topGradient;
  roundRect(ctx, -dimensions.width * 0.44, -dimensions.height * 0.38, dimensions.width * 0.88, dimensions.height * 0.7, 12);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = cell.team === "neutral" ? 3 : 5;
  roundRect(ctx, -dimensions.width * 0.44, -dimensions.height * 0.38, dimensions.width * 0.88, dimensions.height * 0.7, 12);
  ctx.stroke();

  if (cell.isBase) {
    drawCastleCrown(ctx, dimensions, color);
  }

  if (controlled) {
    ctx.fillStyle = POLISH_GOLD;
    ctx.beginPath();
    ctx.moveTo(-dimensions.width * 0.46, -dimensions.height * 0.52);
    ctx.lineTo(-dimensions.width * 0.32, -dimensions.height * 0.64);
    ctx.lineTo(-dimensions.width * 0.18, -dimensions.height * 0.52);
    ctx.lineTo(-dimensions.width * 0.32, -dimensions.height * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#FFFDF9";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.max(18, dimensions.height * 0.45)}px Arial`;
  ctx.fillText(String(cell.soldiers), 0, -1);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `900 ${Math.max(9, dimensions.height * 0.22)}px Arial`;
  ctx.fillText(String(cell.slotIndex), 0, dimensions.height * 0.23);

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
  const top = -dimensions.height * 0.62;
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

function drawNameTag(
  ctx: CanvasRenderingContext2D,
  name: string,
  dimensions: { width: number; height: number },
) {
  const label = name.length > 14 ? `${name.slice(0, 13)}…` : name;
  const width = Math.min(128, Math.max(72, label.length * 8));
  const y = -dimensions.height * 1.02;

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

function drawWinnerBanner(ctx: CanvasRenderingContext2D, size: Size, message: string | null) {
  ctx.save();
  ctx.fillStyle = "rgba(49,25,18,0.54)";
  ctx.fillRect(0, 0, size.width, size.height);

  const cardWidth = Math.min(size.width - 36, 360);
  const cardHeight = 150;
  const x = (size.width - cardWidth) / 2;
  const y = (size.height - cardHeight) / 2;

  ctx.shadowColor = "rgba(49,25,18,0.28)";
  ctx.shadowBlur = 32;
  ctx.fillStyle = "#FFFDF9";
  roundRect(ctx, x, y, cardWidth, cardHeight, 18);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = POLISH_GOLD;
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
  drawMovement(ctx, state, size, now);

  const sortedCells = [...state.cells].sort((a, b) => a.y - b.y || a.slotIndex - b.slotIndex);
  for (const cell of sortedCells) {
    drawTable(ctx, cell, state, size, now, capturePulses);
  }

  drawSparks(ctx, sparks, now);

  if (!state.isPlayer && state.role === "spectator" && !state.isRoundFinished) {
    drawStatusChip(ctx, size, "مشاهدة الجولة");
  }

  if (state.isRoundFinished) {
    drawWinnerBanner(ctx, size, state.winnerMessage);
  }
}

function drawStatusChip(ctx: CanvasRenderingContext2D, size: Size, label: string) {
  ctx.save();
  const width = 126;
  const x = size.width - width - 16;
  const y = 16;
  ctx.fillStyle = "rgba(255,247,227,0.94)";
  ctx.strokeStyle = "rgba(217,163,63,0.38)";
  roundRect(ctx, x, y, width, 34, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#6B3A25";
  ctx.font = "900 13px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + width / 2, y + 17);
  ctx.restore();
}

function nearestCellAt(
  point: { x: number; y: number },
  cells: TableWarsV2Cell[],
  size: Size,
) {
  const dimensions = tableSize(size);
  let nearest: { cell: TableWarsV2Cell; distance: number } | null = null;

  for (const cell of cells) {
    const center = percentToPoint(cell, size);
    const dx = Math.abs(point.x - center.x);
    const dy = Math.abs(point.y - center.y);
    if (dx > dimensions.width * 0.62 || dy > dimensions.height * 0.82) continue;

    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (!nearest || distance < nearest.distance) {
      nearest = { cell, distance };
    }
  }

  return nearest?.cell ?? null;
}

function eventCellId(event: TableWarsV2Event, key: string) {
  const value = event.payload[key];
  return typeof value === "string" ? value : null;
}

export const TableWarsCanvasGame = memo(function TableWarsCanvasGame({
  onCellClick,
  ...props
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<GameState>({
    ...props,
    controlledCellSet: new Set(props.controlledCellIds),
    capturedCellSet: new Set(props.capturedCellIds),
    cellById: new Map(props.cells.map((cell) => [cell.id, cell])),
  });
  const sizeRef = useRef<Size>({ width: 0, height: 0, dpr: 1 });
  const sparksRef = useRef<Spark[]>([]);
  const capturePulsesRef = useRef<Map<string, CapturePulse>>(new Map());
  const seenRoadBattleEventsRef = useRef<Set<string>>(new Set());
  const onCellClickRef = useRef(onCellClick);

  const controlledKey = useMemo(() => props.controlledCellIds.join("|"), [props.controlledCellIds]);
  const capturedKey = useMemo(() => props.capturedCellIds.join("|"), [props.capturedCellIds]);

  useEffect(() => {
    onCellClickRef.current = onCellClick;
  }, [onCellClick]);

  useEffect(() => {
    stateRef.current = {
      ...props,
      controlledCellSet: new Set(props.controlledCellIds),
      capturedCellSet: new Set(props.capturedCellIds),
      cellById: new Map(props.cells.map((cell) => [cell.id, cell])),
    };
  }, [props, controlledKey, capturedKey]);

  useEffect(() => {
    const now = performance.now();
    for (const id of props.capturedCellIds) {
      capturePulsesRef.current.set(id, { id, startedAt: now });
    }
  }, [capturedKey, props.capturedCellIds]);

  useEffect(() => {
    const state = stateRef.current;
    const now = performance.now();

    for (const event of props.events) {
      if (event.eventType !== "road_battle" || seenRoadBattleEventsRef.current.has(event.id)) continue;
      seenRoadBattleEventsRef.current.add(event.id);

      const fromCellId = eventCellId(event, "fromCellId");
      const toCellId = eventCellId(event, "toCellId");
      const from = fromCellId ? state.cellById.get(fromCellId) : null;
      const to = toCellId ? state.cellById.get(toCellId) : null;
      if (!from || !to) continue;

      const size = sizeRef.current;
      const fromPoint = percentToPoint(from, size);
      const toPoint = percentToPoint(to, size);
      sparksRef.current.push({
        id: event.id,
        x: (fromPoint.x + toPoint.x) / 2,
        y: (fromPoint.y + toPoint.y) / 2,
        startedAt: now,
        color: POLISH_GOLD,
      });
    }
  }, [props.events]);

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

    let frameId = 0;
    function frame(now: number) {
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      const size = sizeRef.current;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);

      sparksRef.current = sparksRef.current.filter((spark) => now - spark.startedAt < SPARK_MS);
      for (const [id, pulse] of capturePulsesRef.current.entries()) {
        if (now - pulse.startedAt >= CAPTURE_PULSE_MS) {
          capturePulsesRef.current.delete(id);
        }
      }

      drawScene(ctx, stateRef.current, size, Date.now(), sparksRef.current, capturePulsesRef.current);
      frameId = window.requestAnimationFrame(frame);
    }

    frameId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const state = stateRef.current;
    if (!state.isPlayer || state.isSending || state.isRoundFinished) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const cell = nearestCellAt(
      {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      state.cells,
      sizeRef.current,
    );
    if (cell) onCellClickRef.current(cell);
  }

  return (
    <div ref={containerRef} className="relative h-[76dvh] min-h-[560px] max-h-[680px] overflow-hidden bg-[#F4E7D7]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-manipulation"
        onPointerDown={handlePointerDown}
        aria-label="خريطة حرب الطاولات"
      />
    </div>
  );
});
