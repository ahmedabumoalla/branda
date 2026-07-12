"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCcw, Zap } from "lucide-react";

type Team = "player" | "bot";
type UnitState = "moving" | "attacking" | "defeated";
type UnitKind = "swift_waiter" | "strong_chef" | "branch_guard";
type GameResult = "playing" | "won" | "lost";
type UnitRole = "melee" | "ranged" | "tank" | "support";
type Lane = "top" | "middle" | "bottom";
type UnitIntent = "advance" | "attack" | "defend";
type SpriteState = "idle" | "walk" | "run_to_stop" | "attack" | "hit" | "die";
type WaiterAnimationState = SpriteState;
type UnitFacing = "left" | "right" | "up" | "down";
type BridgeId = "left" | "right";
type AssignedLane = "left" | "right" | "center";
type UnitMode = "attack" | "defend";
type UnitPathStage = "toBridgeEntry" | "toBridgeExit" | "toTarget";
type UnitAnchor = "feet" | "center";
type StructureKind = "mainCastle" | "sideTower";
type StructureSide = "center" | "left" | "right";
type StructureId =
  | "player-main"
  | "player-left-tower"
  | "player-right-tower"
  | "bot-main"
  | "bot-left-tower"
  | "bot-right-tower";

type CardDef = {
  kind: UnitKind;
  name: string;
  shortName: string;
  hp: number;
  speed: number;
  damage: number;
  cost: number;
  role: UnitRole;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
};

type Unit = {
  id: string;
  kind: UnitKind;
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  role: UnitRole;
  team: Team;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  homeTeam: Team;
  assignedBridge: BridgeId;
  assignedLane: AssignedLane;
  primaryTowerId: StructureId;
  strategicTargetId: StructureId;
  mode: UnitMode;
  pathStage: UnitPathStage;
  lane: Lane;
  laneOffset: number;
  intent: UnitIntent;
  targetId: string | null;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  state: UnitState;
  lastAttackAt: number;
  damagedAt: number;
  defeatedAt: number | null;
  hitId: number;
  attackFxId: number;
  attackFxStartedAt: number;
  attackTargetX: number | null;
  attackTargetY: number | null;
  waiterAnimationState: WaiterAnimationState;
  animationTime: number;
  frameIndex: number;
  previousState: WaiterAnimationState;
  stateStartedAt: number;
  lastFacingAngle: Waiter360Angle;
  isAttackLocked: boolean;
  isDeadAnimationComplete: boolean;
};

type StructureDef = {
  id: StructureId;
  team: Team;
  kind: StructureKind;
  side: StructureSide;
  x: number;
  y: number;
  maxHp: number;
  collisionRadius: number;
  targetRadius: number;
  width: number;
  asset: string;
};

type ArenaStructure = StructureDef & {
  hp: number;
  targetable: boolean;
};

type StructureHp = Record<StructureId, number>;

const MAX_ENERGY = 10;
const START_ENERGY = 5;
const BASE_HP = 160;
const SIDE_TOWER_HP = 94;
const LANES: Record<Lane, number> = { top: 27, middle: 50, bottom: 73 };
const LANE_ORDER: Lane[] = ["top", "middle", "bottom"];
const LANE_BAND = 7.5;
const DEFENSE_RADIUS = 22;
const MIN_SEPARATION = 4.2;
const UNIT_COLLISION_RADIUS = 2.2;
const MOVEMENT_SPEED_SCALE = 0.6;
const ENERGY_PER_SECOND = 0.66;
const BOT_SPAWN_SECONDS = 4.25;
const DEFEAT_ANIMATION_MS = 420;
const PLAYER_COLOR = "#7C2948";
const BOT_COLOR = "#14645E";
const MAIN_CASTLE_ASSET = "/assets/arena/branda-main-castle-neutral.png";
const SIDE_TOWER_ASSET = "/assets/arena/branda-side-tower-neutral-v2.png";
const SPRITE_ENABLED_UNITS = new Set<UnitKind>(["swift_waiter"]);
const WAITER_FRAME_BASE_PATH = "/assets/battle-arena/waiter/frames";
const WAITER_360_ANGLES = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315] as const;
type Waiter360Angle = (typeof WAITER_360_ANGLES)[number];
const WAITER_ANIMATION_CONFIG: Record<WaiterAnimationState, { frameCount: number; frameMs: number; loop: boolean }> = {
  idle: { frameCount: 8, frameMs: 150, loop: true },
  walk: { frameCount: 12, frameMs: 70, loop: true },
  run_to_stop: { frameCount: 8, frameMs: 55, loop: false },
  attack: { frameCount: 10, frameMs: 80, loop: false },
  hit: { frameCount: 6, frameMs: 30, loop: false },
  die: { frameCount: 12, frameMs: 35, loop: false },
};
const WAITER_HIT_DURATION_MS = WAITER_ANIMATION_CONFIG.hit.frameCount * WAITER_ANIMATION_CONFIG.hit.frameMs;
const WAITER_FACING_TURN_THRESHOLD_DEGREES = 10;
const WAITER_WALK_MOVEMENT_THRESHOLD = 0.018;
const WAITER_WALK_ANIMATION_MS_PER_ARENA_UNIT = 220;
const WAITER_ATTACK_EXIT_PADDING = 0.65;
const WAITER_ATTACK_STRIKE_FRAME = 3;
const RIVER_Y = 50;
const BRIDGE_Y = 50;
const BRIDGES = {
  left: { x: 28, y: BRIDGE_Y },
  right: { x: 72, y: BRIDGE_Y },
} as const;
const DEPLOYMENT_ZONE = {
  minX: 14,
  maxX: 86,
  minY: 55,
  maxY: 84,
} as const;
const BRIDGE_BLOCK_RADIUS = 8;
const WAYPOINT_REACHED_THRESHOLD = 1.5;
const BRIDGE_ZONE_HALF_WIDTH = 4.8;
const BRIDGE_ZONE_HALF_HEIGHT = 5.4;
const STRUCTURE_ATTACK_RING_MIN = 1.2;
const BUILDING_EDGE_STOP_RANGE = 1.05;
const BUILDING_ATTACK_EDGE_RANGE = 1.35;
const DEPLOYMENT_STRUCTURE_PADDING = 3.4;
const ARENA_POINTS = {
  playerMainBase: { x: 50, y: 88 },
  botMainBase: { x: 50, y: 12 },
  playerSideTowers: [
    { x: 29, y: 72 },
    { x: 71, y: 72 },
  ],
  botSideTowers: [
    { x: 29, y: 28 },
    { x: 71, y: 28 },
  ],
  playerSpawnY: 82,
  botSpawnY: 18,
};

const STRUCTURE_DEFS: StructureDef[] = [
  {
    id: "bot-main",
    team: "bot",
    kind: "mainCastle",
    side: "center",
    x: ARENA_POINTS.botMainBase.x,
    y: ARENA_POINTS.botMainBase.y,
    maxHp: BASE_HP,
    collisionRadius: 8.8,
    targetRadius: 7.8,
    width: 36,
    asset: MAIN_CASTLE_ASSET,
  },
  {
    id: "bot-left-tower",
    team: "bot",
    kind: "sideTower",
    side: "left",
    x: ARENA_POINTS.botSideTowers[0].x,
    y: ARENA_POINTS.botSideTowers[0].y,
    maxHp: SIDE_TOWER_HP,
    collisionRadius: 4.2,
    targetRadius: 4.25,
    width: 14.5,
    asset: SIDE_TOWER_ASSET,
  },
  {
    id: "bot-right-tower",
    team: "bot",
    kind: "sideTower",
    side: "right",
    x: ARENA_POINTS.botSideTowers[1].x,
    y: ARENA_POINTS.botSideTowers[1].y,
    maxHp: SIDE_TOWER_HP,
    collisionRadius: 4.2,
    targetRadius: 4.25,
    width: 14.5,
    asset: SIDE_TOWER_ASSET,
  },
  {
    id: "player-left-tower",
    team: "player",
    kind: "sideTower",
    side: "left",
    x: ARENA_POINTS.playerSideTowers[0].x,
    y: ARENA_POINTS.playerSideTowers[0].y,
    maxHp: SIDE_TOWER_HP,
    collisionRadius: 4.2,
    targetRadius: 4.25,
    width: 14.5,
    asset: SIDE_TOWER_ASSET,
  },
  {
    id: "player-right-tower",
    team: "player",
    kind: "sideTower",
    side: "right",
    x: ARENA_POINTS.playerSideTowers[1].x,
    y: ARENA_POINTS.playerSideTowers[1].y,
    maxHp: SIDE_TOWER_HP,
    collisionRadius: 4.2,
    targetRadius: 4.25,
    width: 14.5,
    asset: SIDE_TOWER_ASSET,
  },
  {
    id: "player-main",
    team: "player",
    kind: "mainCastle",
    side: "center",
    x: ARENA_POINTS.playerMainBase.x,
    y: ARENA_POINTS.playerMainBase.y,
    maxHp: BASE_HP,
    collisionRadius: 8.8,
    targetRadius: 7.8,
    width: 36,
    asset: MAIN_CASTLE_ASSET,
  },
];

const CARDS: CardDef[] = [
  {
    kind: "swift_waiter",
    name: "النادل السريع",
    shortName: "النادل",
    hp: 42,
    speed: 10.5,
    damage: 9,
    cost: 3,
    role: "melee",
    aggroRange: 18,
    attackRange: 4.8,
    attackCooldown: 720,
  },
  {
    kind: "strong_chef",
    name: "الطاهي القوي",
    shortName: "الطاهي",
    hp: 88,
    speed: 5.2,
    damage: 17,
    cost: 5,
    role: "tank",
    aggroRange: 17,
    attackRange: 5.2,
    attackCooldown: 1050,
  },
  {
    kind: "branch_guard",
    name: "حارس الفرع",
    shortName: "الحارس",
    hp: 112,
    speed: 4.4,
    damage: 11,
    cost: 4,
    role: "ranged",
    aggroRange: 25,
    attackRange: 13.5,
    attackCooldown: 980,
  },
];

function makeInitialStructureHp(): StructureHp {
  return STRUCTURE_DEFS.reduce((hp, structure) => {
    hp[structure.id] = structure.maxHp;
    return hp;
  }, {} as StructureHp);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hpPercent(value: number, maxHp: number) {
  return `${clamp((value / maxHp) * 100, 0, 100)}%`;
}

function laneCenter(lane: Lane) {
  return LANES[lane];
}

function laneFromX(x: number): Lane {
  if (x < 40) return "top";
  if (x > 60) return "bottom";
  return "middle";
}

function assignedLaneFromX(x: number): AssignedLane {
  if (x < 42) return "left";
  if (x > 58) return "right";
  return "center";
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function bridgePoint(bridge: BridgeId) {
  return BRIDGES[bridge];
}

function nearestBridgeFromX(x: number): BridgeId {
  return Math.abs(x - BRIDGES.left.x) <= Math.abs(x - BRIDGES.right.x) ? "left" : "right";
}

function lessCrowdedBridge(team: Team, units: Unit[]) {
  const liveTeamUnits = units.filter((unit) => unit.team === team && unit.hp > 0);
  const leftCount = liveTeamUnits.filter((unit) => unit.assignedBridge === "left" && distanceBetween(unit, BRIDGES.left) < 28).length;
  const rightCount = liveTeamUnits.filter((unit) => unit.assignedBridge === "right" && distanceBetween(unit, BRIDGES.right) < 28).length;
  return leftCount <= rightCount ? "left" : "right";
}

function bridgeEntry(team: Team, bridge: BridgeId) {
  const point = bridgePoint(bridge);
  return { x: point.x, y: team === "player" ? RIVER_Y + 4.2 : RIVER_Y - 4.2 };
}

function bridgeExit(team: Team, bridge: BridgeId) {
  const point = bridgePoint(bridge);
  return { x: point.x, y: team === "player" ? RIVER_Y - 4.2 : RIVER_Y + 4.2 };
}

function isInBridgeZone(point: { x: number; y: number }, bridgeId?: BridgeId) {
  const bridges = bridgeId ? [bridgePoint(bridgeId)] : Object.values(BRIDGES);
  return bridges.some(
    (bridge) =>
      Math.abs(point.x - bridge.x) <= BRIDGE_ZONE_HALF_WIDTH && Math.abs(point.y - bridge.y) <= BRIDGE_ZONE_HALF_HEIGHT,
  );
}

function hasPassedBridgeExit(unit: Unit) {
  const exit = bridgeExit(unit.team, unit.assignedBridge);
  return unit.team === "player" ? unit.y <= exit.y + WAYPOINT_REACHED_THRESHOLD : unit.y >= exit.y - WAYPOINT_REACHED_THRESHOLD;
}

function primaryTowerId(team: Team, bridge: BridgeId): StructureId {
  if (team === "player") return bridge === "left" ? "bot-left-tower" : "bot-right-tower";
  return bridge === "left" ? "player-left-tower" : "player-right-tower";
}

function mainCastleId(team: Team): StructureId {
  return team === "player" ? "bot-main" : "player-main";
}

function structureById(id: StructureId) {
  return STRUCTURE_DEFS.find((structure) => structure.id === id) ?? STRUCTURE_DEFS[0]!;
}

function isOnEnemySide(unit: Unit) {
  return unit.team === "player" ? unit.y < RIVER_Y - 1.8 : unit.y > RIVER_Y + 1.8;
}

function enemyInHomeSide(enemy: Unit, team: Team) {
  return team === "player" ? enemy.y > RIVER_Y + 1.8 : enemy.y < RIVER_Y - 1.8;
}

function findLocalThreat(
  unit: Pick<Unit, "team" | "x" | "y" | "aggroRange" | "assignedBridge" | "mode">,
  enemies: Unit[],
  waypoint: { x: number; y: number },
) {
  const localRadius = unit.mode === "defend" ? unit.aggroRange + 7 : unit.aggroRange;
  const laneWidth = unit.mode === "defend" ? 18 : 12;

  return (
    enemies
      .filter((enemy) => enemy.hp > 0)
      .filter((enemy) => {
        const distance = distanceBetween(unit, enemy);
        if (distance <= localRadius) return true;

        const onRoute = segmentDistanceToPoint(unit, waypoint, enemy) <= laneWidth && distance <= unit.aggroRange + 12;
        if (!onRoute) return false;

        const bridge = bridgePoint(unit.assignedBridge);
        return Math.abs(enemy.x - bridge.x) <= 20 || enemyInHomeSide(enemy, unit.team);
      })
      .sort((a, b) => distanceBetween(unit, a) - distanceBetween(unit, b))[0] ?? null
  );
}

function nearestDefensiveThreat(team: Team, point: { x: number; y: number }, enemies: Unit[]) {
  return (
    enemies
      .filter((enemy) => enemy.hp > 0 && enemyInHomeSide(enemy, team))
      .filter((enemy) => distanceBetween(point, enemy) <= DEFENSE_RADIUS)
      .sort((a, b) => distanceBetween(point, a) - distanceBetween(point, b))[0] ?? null
  );
}

function chooseSpawnIntent(team: Team, spawn: { x: number; y: number }, units: Unit[]) {
  const assignedLane = assignedLaneFromX(spawn.x);
  const enemies = units.filter((unit) => unit.team !== team && unit.hp > 0);
  const defensiveThreat = nearestDefensiveThreat(team, spawn, enemies);

  let assignedBridge: BridgeId;
  let mode: UnitMode = "attack";

  if (assignedLane === "left") {
    assignedBridge = "left";
  } else if (assignedLane === "right") {
    assignedBridge = "right";
  } else if (defensiveThreat && distanceBetween(spawn, defensiveThreat) + 4 < distanceBetween(spawn, bridgePoint(nearestBridgeFromX(spawn.x)))) {
    assignedBridge = nearestBridgeFromX(spawn.x);
    mode = "defend";
  } else {
    const nearest = nearestBridgeFromX(spawn.x);
    const crowded = lessCrowdedBridge(team, units);
    assignedBridge = Math.abs(spawn.x - 50) <= 5 ? crowded : nearest;
  }

  const towerId = primaryTowerId(team, assignedBridge);

  return {
    assignedBridge,
    assignedLane,
    primaryTowerId: towerId,
    strategicTargetId: towerId,
    mode,
  };
}

function chooseStrategicStructure(unit: Unit, structureHp: StructureHp) {
  const primaryHp = getStructureHp(structureHp, unit.primaryTowerId);
  const strategicTargetId = primaryHp > 0 ? unit.primaryTowerId : mainCastleId(unit.team);
  const structure = structureById(strategicTargetId);
  return {
    ...structure,
    hp: getStructureHp(structureHp, structure.id),
    targetable: true,
  };
}

function advancePathStage(unit: Unit, structureHp: StructureHp) {
  unit.strategicTargetId = getStructureHp(structureHp, unit.primaryTowerId) > 0 ? unit.primaryTowerId : mainCastleId(unit.team);

  if (unit.pathStage === "toTarget" && !isOnEnemySide(unit) && !isInBridgeZone(unit, unit.assignedBridge)) {
    unit.pathStage = "toBridgeEntry";
  }

  if (unit.pathStage === "toBridgeEntry") {
    const entry = bridgeEntry(unit.team, unit.assignedBridge);
    if (distanceBetween(unit, entry) <= WAYPOINT_REACHED_THRESHOLD || isInBridgeZone(unit, unit.assignedBridge)) {
      unit.pathStage = "toBridgeExit";
    }
  }

  if (unit.pathStage === "toBridgeExit") {
    const exit = bridgeExit(unit.team, unit.assignedBridge);
    if (distanceBetween(unit, exit) <= WAYPOINT_REACHED_THRESHOLD || hasPassedBridgeExit(unit)) {
      unit.pathStage = "toTarget";
    }
  }
}

function structureAttackPoint(unit: Unit, structure: ArenaStructure) {
  const approach = unit.pathStage === "toTarget" || isOnEnemySide(unit) ? bridgeExit(unit.team, unit.assignedBridge) : unit;
  let dx = approach.x - structure.x;
  let dy = approach.y - structure.y;
  let distance = Math.hypot(dx, dy);

  if (distance <= 0.001) {
    dx = unit.x - structure.x;
    dy = unit.y - structure.y;
    distance = Math.hypot(dx, dy);
  }

  if (distance <= 0.001) {
    dx = 0;
    dy = unit.team === "player" ? 1 : -1;
    distance = 1;
  }

  const ringDistance = structure.targetRadius + Math.max(STRUCTURE_ATTACK_RING_MIN, BUILDING_EDGE_STOP_RANGE);
  return {
    x: clamp(structure.x + (dx / distance) * ringDistance, 12, 88),
    y: clamp(structure.y + (dy / distance) * ringDistance, 10, 90),
  };
}

function strategicWaypoint(unit: Unit, structureHp: StructureHp) {
  advancePathStage(unit, structureHp);

  if (unit.pathStage === "toBridgeEntry") {
    return bridgeEntry(unit.team, unit.assignedBridge);
  }

  if (unit.pathStage === "toBridgeExit") {
    return bridgeExit(unit.team, unit.assignedBridge);
  }

  return structureAttackPoint(unit, chooseStrategicStructure(unit, structureHp));
}

function getStructureHp(structureHp: StructureHp, id: StructureId) {
  return structureHp[id] ?? 0;
}

function hasLiveSideTower(team: Team, structureHp: StructureHp) {
  return STRUCTURE_DEFS.some(
    (structure) => structure.team === team && structure.kind === "sideTower" && getStructureHp(structureHp, structure.id) > 0,
  );
}

function isStructureTargetable(structure: StructureDef, structureHp: StructureHp) {
  if (getStructureHp(structureHp, structure.id) <= 0) return false;
  if (structure.kind === "sideTower") return true;
  return !hasLiveSideTower(structure.team, structureHp);
}

function getArenaStructures(structureHp: StructureHp): ArenaStructure[] {
  return STRUCTURE_DEFS.map((structure) => ({
    ...structure,
    hp: getStructureHp(structureHp, structure.id),
    targetable: isStructureTargetable(structure, structureHp),
  }));
}

function targetableStructures(team: Team, structureHp: StructureHp) {
  const structures = getArenaStructures(structureHp).filter((structure) => structure.team === team && structure.targetable);
  const sideTowers = structures.filter((structure) => structure.kind === "sideTower");
  return sideTowers.length > 0 ? sideTowers : structures.filter((structure) => structure.kind === "mainCastle");
}

function chooseStructureTarget(unit: Unit, structureHp: StructureHp) {
  const enemyStructures = targetableStructures(enemyTeam(unit.team), structureHp);
  return (
    enemyStructures.sort((a, b) => {
      const aLanePull = Math.abs(a.x - laneCenter(unit.lane)) * 0.22;
      const bLanePull = Math.abs(b.x - laneCenter(unit.lane)) * 0.22;
      return distanceBetween(unit, a) + aLanePull - (distanceBetween(unit, b) + bLanePull);
    })[0] ?? null
  );
}

function distanceToStructure(unit: { x: number; y: number }, structure: ArenaStructure) {
  return Math.max(0, distanceBetween(unit, structure) - structure.targetRadius);
}

function buildingAttackEdgeRange(_unit: Unit, _structure: ArenaStructure) {
  return BUILDING_ATTACK_EDGE_RANGE;
}

function segmentDistanceToPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  point: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.001) return distanceBetween(start, point);

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return distanceBetween({ x: start.x + dx * t, y: start.y + dy * t }, point);
}

function detourAroundStructures(
  unit: Unit,
  waypoint: { x: number; y: number },
  structures: ArenaStructure[],
  targetStructureId: StructureId | null,
) {
  if (isInBridgeZone(unit, unit.assignedBridge) || isInBridgeZone(waypoint, unit.assignedBridge)) return waypoint;

  const blocking = structures
    .filter((structure) => structure.hp > 0 && structure.id !== targetStructureId)
    .filter((structure) => segmentDistanceToPoint(unit, waypoint, structure) < structure.collisionRadius + UNIT_COLLISION_RADIUS + 2.8)
    .sort((a, b) => distanceBetween(unit, a) - distanceBetween(unit, b))[0];

  if (!blocking) return waypoint;

  const dx = waypoint.x - unit.x;
  const dy = waypoint.y - unit.y;
  const distance = Math.max(Math.hypot(dx, dy), 0.001);
  const px = -dy / distance;
  const py = dx / distance;
  const projectedSide = (unit.x - blocking.x) * px + (unit.y - blocking.y) * py;
  const laneSide = unit.lane === "top" ? -1 : unit.lane === "bottom" ? 1 : unit.x <= blocking.x ? -1 : 1;
  const side = Math.abs(projectedSide) > 0.4 ? (projectedSide >= 0 ? 1 : -1) : laneSide;
  const clearance = blocking.collisionRadius + UNIT_COLLISION_RADIUS + 4.2;
  const forwardNudge = blocking.kind === "sideTower" ? 2.4 : 1.4;

  return {
    x: clamp(blocking.x + px * clearance * side + (dx / distance) * forwardNudge, 12, 88),
    y: clamp(blocking.y + py * clearance * side + (dy / distance) * forwardNudge, 10, 90),
  };
}

function keepOutsideStructures(
  point: { x: number; y: number },
  structures: ArenaStructure[],
  previous?: { x: number; y: number },
) {
  if (isInBridgeZone(point) || (previous && isInBridgeZone(previous))) return point;

  let next = { ...point };

  for (const structure of structures) {
    if (structure.hp <= 0) continue;

    const minimumDistance = structure.collisionRadius + UNIT_COLLISION_RADIUS;
    let dx = next.x - structure.x;
    let dy = next.y - structure.y;
    let distance = Math.hypot(dx, dy);
    if (distance >= minimumDistance) continue;

    if (distance <= 0.001) {
      dx = previous ? point.x - previous.x : next.x >= structure.x ? 1 : -1;
      dy = previous ? point.y - previous.y : 0;
      distance = Math.max(Math.hypot(dx, dy), 0.001);
    }

    next = {
      x: clamp(structure.x + (dx / distance) * minimumDistance, 12, 88),
      y: clamp(structure.y + (dy / distance) * minimumDistance, 10, 90),
    };
  }

  return next;
}

function isDeployablePoint(point: { x: number; y: number }, structures: ArenaStructure[]) {
  const insidePlayerHalf =
    point.x >= DEPLOYMENT_ZONE.minX &&
    point.x <= DEPLOYMENT_ZONE.maxX &&
    point.y >= DEPLOYMENT_ZONE.minY &&
    point.y <= DEPLOYMENT_ZONE.maxY;

  if (!insidePlayerHalf) return false;

  const onBridge = Object.values(BRIDGES).some((bridge) => distanceBetween(point, bridge) <= BRIDGE_BLOCK_RADIUS);
  if (onBridge) return false;

  return !structures.some(
    (structure) =>
      structure.hp > 0 &&
      distanceBetween(point, structure) <= structure.collisionRadius + UNIT_COLLISION_RADIUS + DEPLOYMENT_STRUCTURE_PADDING,
  );
}

function blockingStructureAt(point: { x: number; y: number }, structures: ArenaStructure[]) {
  return (
    structures
      .filter((structure) => structure.hp > 0)
      .filter((structure) => distanceBetween(point, structure) < structure.collisionRadius + UNIT_COLLISION_RADIUS + 0.8)
      .sort((a, b) => distanceBetween(point, a) - distanceBetween(point, b))[0] ?? null
  );
}

function normalizeSpawnPoint(team: Team, lane: Lane, point: { x: number; y: number }, structures: ArenaStructure[]) {
  const bridge = nearestBridgeFromX(point.x);
  const frontDirection = team === "player" ? -1 : 1;
  let next = {
    x:
      team === "player"
        ? clamp(point.x, DEPLOYMENT_ZONE.minX, DEPLOYMENT_ZONE.maxX)
        : clamp(point.x, laneCenter(lane) - LANE_BAND, laneCenter(lane) + LANE_BAND),
    y:
      team === "player"
        ? clamp(point.y, bridgeExit("bot", bridge).y + 2, DEPLOYMENT_ZONE.maxY)
        : clamp(point.y, ARENA_POINTS.botSpawnY, bridgeEntry("bot", bridge).y - 2),
  };

  for (let index = 0; index < 4; index += 1) {
    const blocking = blockingStructureAt(next, structures);
    if (!blocking) break;

    next = {
      x: clamp(next.x, 12, 88),
      y: clamp(blocking.y + frontDirection * (blocking.collisionRadius + UNIT_COLLISION_RADIUS + 3), 10, 90),
    };
  }

  return next;
}

function damageStructure(structureHp: StructureHp, id: StructureId, damage: number) {
  structureHp[id] = clamp((structureHp[id] ?? 0) - damage, 0, STRUCTURE_DEFS.find((structure) => structure.id === id)?.maxHp ?? BASE_HP);
}

function basePoint(team: Team) {
  return team === "player" ? ARENA_POINTS.playerMainBase : ARENA_POINTS.botMainBase;
}

function defensePoints(team: Team) {
  return team === "player"
    ? [ARENA_POINTS.playerMainBase, ...ARENA_POINTS.playerSideTowers]
    : [ARENA_POINTS.botMainBase, ...ARENA_POINTS.botSideTowers];
}

function nearestDefensePoint(unit: Unit, team: Team) {
  return defensePoints(team).sort((a, b) => distanceBetween(unit, a) - distanceBetween(unit, b))[0] ?? basePoint(team);
}

function enemyTeam(team: Team): Team {
  return team === "player" ? "bot" : "player";
}

function isNearBase(unit: Unit, team: Team, radius = DEFENSE_RADIUS) {
  return defensePoints(team).some((point) => distanceBetween(unit, point) <= radius);
}

function isAcrossRiver(fromY: number, toY: number) {
  return (fromY - RIVER_Y) * (toY - RIVER_Y) < 0;
}

function bridgeForLane(lane: Lane) {
  if (lane === "top") return BRIDGES.left;
  if (lane === "bottom") return BRIDGES.right;
  return Math.random() < 0.5 ? BRIDGES.left : BRIDGES.right;
}

function bridgeForRoute(unit: Unit, destination: { x: number; y: number }) {
  if (unit.lane === "middle") {
    const leftDistance = Math.abs(unit.x - BRIDGES.left.x) + Math.abs(destination.x - BRIDGES.left.x);
    const rightDistance = Math.abs(unit.x - BRIDGES.right.x) + Math.abs(destination.x - BRIDGES.right.x);
    return leftDistance <= rightDistance ? BRIDGES.left : BRIDGES.right;
  }

  return bridgeForLane(unit.lane);
}

function routePoint(
  unit: Unit,
  destination: { x: number; y: number },
  structures: ArenaStructure[],
  targetStructureId: StructureId | null,
) {
  if (isInBridgeZone(unit, unit.assignedBridge) || isInBridgeZone(destination, unit.assignedBridge)) return destination;
  if (!isAcrossRiver(unit.y, destination.y)) return detourAroundStructures(unit, destination, structures, targetStructureId);

  const entry = bridgeEntry(unit.team, unit.assignedBridge);

  if (distanceBetween(unit, entry) > WAYPOINT_REACHED_THRESHOLD) {
    return detourAroundStructures(unit, entry, structures, targetStructureId);
  }

  return bridgeExit(unit.team, unit.assignedBridge);
}

function laneFromPressure(units: Unit[]) {
  let bestLane: Lane | null = null;
  let bestScore = 0;

  for (const lane of LANE_ORDER) {
    const score = units.reduce((total, unit) => {
      if (unit.team !== "player" || unit.hp <= 0 || unit.y > 55 || Math.abs(unit.x - laneCenter(lane)) > LANE_BAND + 3) {
        return total;
      }

      return total + (unit.role === "tank" ? 2 : 1);
    }, 0);

    if (score > bestScore) {
      bestLane = lane;
      bestScore = score;
    }
  }

  return bestScore >= 2 ? bestLane : null;
}

function randomLane() {
  return LANE_ORDER[Math.floor(Math.random() * LANE_ORDER.length)] ?? "middle";
}

function chooseBestEnemyTarget(unit: Unit, enemies: Unit[]) {
  const defendersCanHelp =
    distanceBetween(unit, nearestDefensePoint(unit, unit.team)) <= DEFENSE_RADIUS + 26 || unit.role === "ranged";

  const invadingEnemy = enemies
    .filter((enemy) => enemy.hp > 0 && isNearBase(enemy, unit.team, DEFENSE_RADIUS))
    .filter((enemy) => defendersCanHelp || distanceBetween(unit, enemy) <= unit.aggroRange + 10)
    .sort((a, b) => distanceBetween(unit, a) - distanceBetween(unit, b))[0];

  if (invadingEnemy) {
    return { target: invadingEnemy, intent: "defend" as UnitIntent };
  }

  const candidates = enemies
    .filter((enemy) => enemy.hp > 0 && distanceBetween(unit, enemy) <= unit.aggroRange)
    .sort((a, b) => {
      const aBasePressure = a.intent === "attack" && a.targetId?.startsWith(`structure:${unit.team}-`) ? -8 : 0;
      const bBasePressure = b.intent === "attack" && b.targetId?.startsWith(`structure:${unit.team}-`) ? -8 : 0;
      return distanceBetween(unit, a) + aBasePressure - (distanceBetween(unit, b) + bBasePressure);
    });

  return { target: candidates[0] ?? null, intent: candidates[0] ? ("attack" as UnitIntent) : ("advance" as UnitIntent) };
}

function resultLabel(result: GameResult) {
  if (result === "won") return "فزت";
  if (result === "lost") return "خسرت";
  return "المعركة مستمرة";
}

function teamColor(team: Team) {
  return team === "player" ? PLAYER_COLOR : BOT_COLOR;
}

function applyDamage(target: Unit, damage: number, now: number) {
  if (target.hp <= 0) return;

  target.hp -= damage;
  target.damagedAt = now;
  target.hitId += 1;

  if (target.hp <= 0) {
    target.hp = 0;
    target.state = "defeated";
    target.defeatedAt = now;
    startWaiterDieAnimation(target, now);
  } else if (target.kind === "swift_waiter") {
    setWaiterAnimationState(target, "hit", now, true);
    target.frameIndex = waiterFrameIndex(target, now);
  }
}

function CharacterFigure({
  kind,
  team = "player",
  state = "moving",
  compact = false,
  face,
}: {
  kind: UnitKind;
  team?: Team;
  state?: UnitState;
  compact?: boolean;
  face?: number;
}) {
  const isAttacking = state === "attacking";
  const faceDirection = face ?? (team === "player" ? 1 : -1);

  return (
    <span
      className={`ba-character ${compact ? "ba-character-mini" : ""} ba-${kind} ba-${team} ba-${state}`}
      style={{ "--team": teamColor(team), "--face": faceDirection } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ba-shadow" />
      <span className="ba-sprite">
        <span className="ba-figure">
          <span className="ba-leg ba-leg-left" />
          <span className="ba-leg ba-leg-right" />
          <span className="ba-body">
            <span className="ba-collar" />
            <span className="ba-apron" />
            <span className="ba-belt" />
            {kind === "branch_guard" ? <span className="ba-shield-mark" /> : null}
          </span>
          <span className="ba-arm ba-arm-left" />
          <span className="ba-arm ba-arm-right" />
          <span className="ba-head">
            <span className="ba-hair" />
            <span className="ba-face-detail" />
            {kind === "strong_chef" ? (
              <span className="ba-chef-hat">
                <span />
                <span />
                <span />
              </span>
            ) : null}
            {kind === "branch_guard" ? <span className="ba-cap" /> : null}
            {kind === "swift_waiter" ? <span className="ba-bowtie" /> : null}
          </span>
          <Accessory kind={kind} active={isAttacking} />
        </span>
      </span>
    </span>
  );
}

function Accessory({ kind, active }: { kind: UnitKind; active: boolean }) {
  if (kind === "swift_waiter") {
    return (
      <span className={`ba-accessory ba-tray ${active ? "ba-accessory-active" : ""}`}>
        <span className="ba-tray-plate" />
        <span className="ba-cup" />
        <span className="ba-steam" />
      </span>
    );
  }

  if (kind === "strong_chef") {
    return (
      <span className={`ba-accessory ba-pan ${active ? "ba-accessory-active" : ""}`}>
        <span className="ba-pan-head" />
        <span className="ba-pan-handle" />
        <span className="ba-bean ba-bean-one" />
        <span className="ba-bean ba-bean-two" />
      </span>
    );
  }

  return (
    <span className={`ba-accessory ba-badge-shield ${active ? "ba-accessory-active" : ""}`}>
      <svg viewBox="0 0 30 34" role="img" aria-label="">
        <path d="M15 2 27 7v9c0 8-5 13-12 16C8 29 3 24 3 16V7l12-5Z" />
        <path d="M15 8v17M8 14h14" />
      </svg>
    </span>
  );
}

function unitSpriteState(unit: Unit, animationTime: number): SpriteState {
  if (unit.kind === "swift_waiter") return unit.waiterAnimationState;
  if (unit.state === "defeated") return "die";
  if (unit.damagedAt > 0 && animationTime - unit.damagedAt < 180) return "hit";
  if (unit.state === "attacking") return "attack";
  if (unit.state === "moving") return "walk";
  return "idle";
}

function angleDelta(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function nearestWaiterAngle(degrees: number): Waiter360Angle {
  return WAITER_360_ANGLES.reduce((best, angle) => (angleDelta(degrees, angle) < angleDelta(degrees, best) ? angle : best), WAITER_360_ANGLES[0]);
}

function angleVector(angle: Waiter360Angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: Math.sin(radians),
    y: Math.cos(radians),
  };
}

function angleFromVector(dx: number, dy: number, fallback: Waiter360Angle) {
  if (Math.hypot(dx, dy) <= 0.2) return fallback;
  return nearestWaiterAngle((Math.atan2(dx, dy) * 180) / Math.PI + 360);
}

function initialWaiterFacingAngle(team: Team): Waiter360Angle {
  return team === "player" ? 180 : 0;
}

function stableWaiterFacingAngle(unit: Unit, desiredAngle: Waiter360Angle) {
  if (angleDelta(desiredAngle, unit.lastFacingAngle) < WAITER_FACING_TURN_THRESHOLD_DEGREES) {
    return unit.lastFacingAngle;
  }

  return desiredAngle;
}

function waiterAttackCycleMs(unit: Unit) {
  return Math.max(330, unit.attackCooldown);
}

function waiterAttackFrame(unit: Unit, now: number) {
  if (unit.lastAttackAt <= 0) return 0;

  const frameCount = WAITER_ANIMATION_CONFIG.attack.frameCount;
  const frameMs = waiterAttackCycleMs(unit) / frameCount;
  return clamp(Math.floor((now - unit.lastAttackAt) / frameMs), 0, frameCount - 1);
}

function waiterFrameIndex(unit: Unit, now: number) {
  const config = WAITER_ANIMATION_CONFIG[unit.waiterAnimationState];

  if (unit.waiterAnimationState === "walk") {
    return Math.floor(unit.animationTime / config.frameMs) % config.frameCount;
  }

  if (unit.waiterAnimationState === "attack") {
    return waiterAttackFrame(unit, now);
  }

  if (unit.waiterAnimationState === "hit") {
    return clamp(Math.floor(Math.max(0, now - unit.damagedAt) / config.frameMs), 0, config.frameCount - 1);
  }

  if (unit.waiterAnimationState === "die" && unit.defeatedAt !== null) {
    return clamp(Math.floor((now - unit.defeatedAt) / config.frameMs), 0, config.frameCount - 1);
  }

  const elapsed = Math.max(0, now - unit.stateStartedAt);
  const frameIndex = Math.floor(elapsed / config.frameMs);
  return config.loop ? frameIndex % config.frameCount : clamp(frameIndex, 0, config.frameCount - 1);
}

function setWaiterAnimationState(unit: Unit, nextState: WaiterAnimationState, now: number, restart = false) {
  if (unit.waiterAnimationState !== nextState || restart) {
    unit.previousState = unit.waiterAnimationState;
    unit.waiterAnimationState = nextState;
    unit.stateStartedAt = now;
    unit.animationTime = 0;
  } else if (nextState !== "walk") {
    unit.animationTime = Math.max(0, now - unit.stateStartedAt);
  }
}

function updateWaiterAnimationController(
  unit: Unit,
  now: number,
  desiredState: WaiterAnimationState,
  desiredFacingAngle: Waiter360Angle,
  movementDistance: number,
) {
  if (unit.kind !== "swift_waiter") return;

  if (unit.hp <= 0) {
    startWaiterDieAnimation(unit, now);
    return;
  }

  unit.lastFacingAngle = stableWaiterFacingAngle(unit, desiredFacingAngle);

  const isFreshHit = unit.damagedAt > 0 && now - unit.damagedAt < WAITER_HIT_DURATION_MS;
  const runToStopDuration = WAITER_ANIMATION_CONFIG.run_to_stop.frameCount * WAITER_ANIMATION_CONFIG.run_to_stop.frameMs;
  let nextState: WaiterAnimationState = isFreshHit ? "hit" : desiredState;

  if (!isFreshHit && desiredState === "idle") {
    if (unit.waiterAnimationState === "walk") {
      nextState = "run_to_stop";
    } else if (unit.waiterAnimationState === "run_to_stop" && now - unit.stateStartedAt < runToStopDuration) {
      nextState = "run_to_stop";
    }
  }

  setWaiterAnimationState(unit, nextState, now, nextState === "hit" && unit.damagedAt > unit.stateStartedAt);

  if (nextState === "walk" && movementDistance > WAITER_WALK_MOVEMENT_THRESHOLD) {
    unit.animationTime += movementDistance * WAITER_WALK_ANIMATION_MS_PER_ARENA_UNIT;
  }

  unit.frameIndex = waiterFrameIndex(unit, now);
}

function startWaiterDieAnimation(unit: Unit, now: number) {
  if (unit.kind !== "swift_waiter") return;

  if (unit.waiterAnimationState !== "die") {
    unit.previousState = unit.waiterAnimationState;
    unit.waiterAnimationState = "die";
    unit.stateStartedAt = unit.defeatedAt ?? now;
    unit.animationTime = 0;
    unit.frameIndex = 0;
    unit.isAttackLocked = false;
  }

  const dieStartedAt = unit.defeatedAt ?? unit.stateStartedAt;
  unit.animationTime = Math.max(0, now - dieStartedAt);
  unit.frameIndex = waiterFrameIndex(unit, now);
  unit.isDeadAnimationComplete = unit.animationTime >= DEFEAT_ANIMATION_MS;
}

function waiterAttackDecisionRange(unit: Unit) {
  return unit.kind === "swift_waiter" && (unit.waiterAnimationState === "attack" || unit.state === "attacking")
    ? unit.attackRange + WAITER_ATTACK_EXIT_PADDING
    : unit.attackRange;
}

function unitSpriteAngle(unit: Unit): Waiter360Angle {
  if (unit.kind === "swift_waiter") return unit.lastFacingAngle;

  const fallback: Waiter360Angle = unit.team === "player" ? 180 : 0;
  if (unit.attackTargetX !== null && unit.attackTargetY !== null) {
    return angleFromVector(unit.attackTargetX - unit.x, unit.attackTargetY - unit.y, fallback);
  }

  if (unit.state === "moving") {
    const destination =
      unit.pathStage === "toBridgeEntry"
        ? bridgeEntry(unit.team, unit.assignedBridge)
        : unit.pathStage === "toBridgeExit"
          ? bridgeExit(unit.team, unit.assignedBridge)
          : structureById(unit.strategicTargetId);
    return angleFromVector(destination.x - unit.x, destination.y - unit.y, fallback);
  }

  return fallback;
}

function facingFromAngle(angle: Waiter360Angle): UnitFacing {
  if (angleDelta(angle, 90) <= 45) return "right";
  if (angleDelta(angle, 270) <= 45) return "left";
  return angleDelta(angle, 0) < angleDelta(angle, 180) ? "down" : "up";
}

function spriteFrames(kind: UnitKind, spriteState: SpriteState) {
  if (!SPRITE_ENABLED_UNITS.has(kind)) return [];
  const frameCount = WAITER_ANIMATION_CONFIG[spriteState].frameCount;
  return Array.from(
    { length: frameCount },
    (_, index) => `${WAITER_FRAME_BASE_PATH}/${spriteState}/${spriteState}_${String(index).padStart(3, "0")}.png`,
  );
}

function unitAnimationFrame(unit: Unit, spriteState: SpriteState, animationTime: number) {
  const frames = spriteFrames(unit.kind, spriteState);
  if (frames.length <= 1) return 0;
  if (unit.kind === "swift_waiter") return clamp(unit.frameIndex, 0, frames.length - 1);

  const seed = Number(unit.id.replace(/\D/g, "")) * 37;

  if (spriteState === "attack") {
    const elapsed = Math.max(0, animationTime - (unit.lastAttackAt || seed));
    return Math.floor(elapsed / 95) % frames.length;
  }

  if (spriteState === "die" && unit.defeatedAt !== null) {
    return clamp(Math.floor((animationTime - unit.defeatedAt) / 160), 0, frames.length - 1);
  }

  const frameMs = spriteState === "walk" ? 115 : 260;
  return Math.floor((animationTime + seed) / frameMs) % frames.length;
}

function attackOrigin(unit: Unit, spriteAngle: Waiter360Angle) {
  const direction = angleVector(spriteAngle);
  return {
    x: unit.x + direction.x * 1.18,
    y: unit.y - 1.9 + direction.y * 1.18,
  };
}

function UnitSprite({
  kind,
  spriteState,
  facing,
  animationFrame,
}: {
  kind: UnitKind;
  spriteState: SpriteState;
  facing: UnitFacing;
  animationFrame: number;
}) {
  const frames = spriteFrames(kind, spriteState);
  const spriteSrc = frames[animationFrame % Math.max(frames.length, 1)];

  if (!SPRITE_ENABLED_UNITS.has(kind) || !spriteSrc) return null;

  return (
    <img
      className={`ba-unit-sprite ba-unit-sprite-${facing}`}
      src={spriteSrc}
      alt=""
      draggable={false}
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  );
}

function UnitVisual({
  kind,
  team = "player",
  spriteState = "idle",
  facing = "up",
  animationFrame = 0,
  anchoredPosition = "feet",
  compact = false,
}: {
  kind: UnitKind;
  team?: Team;
  spriteState?: SpriteState;
  facing?: UnitFacing;
  animationFrame?: number;
  anchoredPosition?: UnitAnchor;
  compact?: boolean;
}) {
  return (
    <span
      className={`ba-unit-visual ${compact ? "ba-unit-visual-compact" : ""} ba-unit-visual-${kind} ba-unit-visual-${team} ba-unit-visual-${spriteState} ba-unit-facing-${facing} ba-unit-anchor-${anchoredPosition}`}
      style={{ "--team": teamColor(team) } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ba-unit-ground" />
      <span className="ba-unit-placeholder">
        <UnitSprite kind={kind} spriteState={spriteState} facing={facing} animationFrame={animationFrame} />
        <span className="ba-unit-placeholder-body">
          <span className="ba-unit-placeholder-head" />
          <span className="ba-unit-placeholder-mark" />
        </span>
      </span>
    </span>
  );
}

function ArenaUnit({ unit }: { unit: Unit }) {
  const hpPercent = `${clamp((unit.hp / unit.maxHp) * 100, 0, 100)}%`;
  const depthScale = 0.76 + (unit.y / 100) * 0.18;
  const animationTime = typeof performance === "undefined" ? 0 : performance.now();
  const spriteState = unitSpriteState(unit, animationTime);
  const spriteAngle = unitSpriteAngle(unit);
  const facing = facingFromAngle(spriteAngle);
  const animationFrame = unitAnimationFrame(unit, spriteState, animationTime);

  return (
    <div
      className={`ba-unit ba-unit-${unit.team} ba-unit-kind-${unit.kind} ${unit.state === "defeated" ? "ba-unit-defeated" : ""}`}
      style={
        {
          left: `${unit.x}%`,
          top: `${unit.y}%`,
          "--hp": hpPercent,
          "--team": teamColor(unit.team),
          "--depth": depthScale,
          zIndex: 80 + Math.round(unit.y),
        } as CSSProperties
      }
      title={unit.name}
    >
      <UnitVisual
        kind={unit.kind}
        team={unit.team}
        spriteState={spriteState}
        facing={facing}
        animationFrame={animationFrame}
        anchoredPosition="feet"
      />
      <span className="ba-hp-track">
        <span className="ba-hp-fill" />
      </span>
      {unit.targetId && unit.state !== "defeated" ? <span className="ba-target-lock" /> : null}
      {unit.state === "attacking" ? <span className="ba-attack-ring" /> : null}
      {unit.hitId > 0 ? <span key={unit.hitId} className="ba-hit-flash" /> : null}
    </div>
  );
}

function ArenaStructureObject({ structure }: { structure: ArenaStructure }) {
  const healthPercent = hpPercent(structure.hp, structure.maxHp);
  const destroyed = structure.hp <= 0;

  return (
    <div
      className={`ba-structure ba-structure-${structure.kind} ba-structure-${structure.team} ba-structure-${structure.side} ${
        destroyed ? "ba-structure-destroyed" : ""
      } ${structure.targetable ? "ba-structure-targetable" : ""}`}
      style={
        {
          left: `${structure.x}%`,
          top: `${structure.y}%`,
          width: `${structure.width}%`,
          "--team": teamColor(structure.team),
          "--hp": healthPercent,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <img className="ba-structure-asset" src={structure.asset} alt="" draggable={false} />
      <div className="ba-base-health">
        <span />
      </div>
    </div>
  );
}

export function BattleArenaGame() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [structureHp, setStructureHp] = useState<StructureHp>(() => makeInitialStructureHp());
  const [energy, setEnergy] = useState(START_ENERGY);
  const [result, setResult] = useState<GameResult>("playing");
  const [notice, setNotice] = useState("اختر بطاقة ثم ضعها داخل منطقتك.");
  const [selectedCardKind, setSelectedCardKind] = useState<UnitKind | null>(null);

  const unitsRef = useRef<Unit[]>([]);
  const structureHpRef = useRef<StructureHp>(makeInitialStructureHp());
  const energyRef = useRef(START_ENERGY);
  const resultRef = useRef<GameResult>("playing");
  const nextUnitIdRef = useRef(1);
  const nextLaneRef = useRef(0);
  const botTimerRef = useRef(3.2);
  const botCardIndexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  const syncUnits = useCallback((nextUnits: Unit[]) => {
    unitsRef.current = nextUnits;
    setUnits(nextUnits);
  }, []);

  const syncStructureHp = useCallback((nextStructureHp: StructureHp) => {
    structureHpRef.current = nextStructureHp;
    setStructureHp(nextStructureHp);
  }, []);

  const syncEnergy = useCallback((nextEnergy: number) => {
    const rounded = Number(clamp(nextEnergy, 0, MAX_ENERGY).toFixed(2));
    energyRef.current = rounded;
    setEnergy(rounded);
  }, []);

  const syncResult = useCallback((nextResult: GameResult) => {
    resultRef.current = nextResult;
    setResult(nextResult);
  }, []);

  const spawnUnit = useCallback(
    (team: Team, card: CardDef, laneOverride?: Lane, spawnPoint?: { x: number; y: number }) => {
      const lane =
        laneOverride ??
        (spawnPoint ? laneFromX(spawnPoint.x) : null) ??
        (team === "player" ? LANE_ORDER[nextLaneRef.current % LANE_ORDER.length] : randomLane()) ??
        "middle";
      if (team === "player" && !spawnPoint) nextLaneRef.current += 1;
      const rawLaneOffset = spawnPoint ? spawnPoint.x - laneCenter(lane) : (Math.random() - 0.5) * 5.5;
      const rawSpawn = {
        x: spawnPoint
          ? spawnPoint.x
          : clamp(laneCenter(lane) + rawLaneOffset, laneCenter(lane) - LANE_BAND, laneCenter(lane) + LANE_BAND),
        y: spawnPoint
          ? spawnPoint.y
          : team === "player"
            ? ARENA_POINTS.playerSpawnY + Math.random() * 3
            : ARENA_POINTS.botSpawnY + 15 + Math.random() * 3,
      };
      const spawn = normalizeSpawnPoint(team, lane, rawSpawn, getArenaStructures(structureHpRef.current));
      const laneOffset = spawn.x - laneCenter(lane);
      const spawnIntent = chooseSpawnIntent(team, spawn, unitsRef.current);
      const initialFacingAngle = initialWaiterFacingAngle(team);

      const nextUnit: Unit = {
        id: `${team}-${nextUnitIdRef.current}`,
        kind: card.kind,
        name: card.name,
        hp: card.hp,
        maxHp: card.hp,
        speed: card.speed,
        damage: card.damage,
        role: card.role,
        team,
        x: spawn.x,
        y: spawn.y,
        spawnX: spawn.x,
        spawnY: spawn.y,
        homeTeam: team,
        assignedBridge: spawnIntent.assignedBridge,
        assignedLane: spawnIntent.assignedLane,
        primaryTowerId: spawnIntent.primaryTowerId,
        strategicTargetId: spawnIntent.strategicTargetId,
        mode: spawnIntent.mode,
        pathStage: "toBridgeEntry",
        lane,
        laneOffset,
        intent: "advance",
        targetId: null,
        aggroRange: card.aggroRange,
        attackRange: card.attackRange,
        attackCooldown: card.attackCooldown,
        state: "moving",
        lastAttackAt: 0,
        damagedAt: 0,
        defeatedAt: null,
        hitId: 0,
        attackFxId: 0,
        attackFxStartedAt: 0,
        attackTargetX: null,
        attackTargetY: null,
        waiterAnimationState: "idle",
        animationTime: 0,
        frameIndex: 0,
        previousState: "idle",
        stateStartedAt: 0,
        lastFacingAngle: initialFacingAngle,
        isAttackLocked: false,
        isDeadAnimationComplete: false,
      };

      nextUnitIdRef.current += 1;
      syncUnits([...unitsRef.current, nextUnit]);
    },
    [syncUnits],
  );

  const selectCard = useCallback(
    (card: CardDef) => {
      if (resultRef.current !== "playing") return;

      if (energyRef.current < card.cost) {
        setNotice("الطاقة غير كافية لهذه البطاقة.");
        setSelectedCardKind(null);
        return;
      }

      setSelectedCardKind(card.kind);
      setNotice(`${card.shortName}: اختر مكان الاستدعاء.`);
    },
    [],
  );

  const deploySelectedCard = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (resultRef.current !== "playing" || !selectedCardKind) return;

      const card = CARDS.find((candidate) => candidate.kind === selectedCardKind);
      if (!card) return;

      if (energyRef.current < card.cost) {
        setNotice("الطاقة غير كافية لهذه البطاقة.");
        setSelectedCardKind(null);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const point = {
        x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
      };
      const arenaStructures = getArenaStructures(structureHpRef.current);

      if (!isDeployablePoint(point, arenaStructures)) {
        setNotice("اختر مكانًا داخل منطقتك");
        return;
      }

      syncEnergy(energyRef.current - card.cost);
      spawnUnit("player", card, laneFromX(point.x), point);
      setSelectedCardKind(null);
      setNotice(`تم إرسال ${card.shortName}.`);
    },
    [selectedCardKind, spawnUnit, syncEnergy],
  );

  const resetGame = useCallback(() => {
    syncUnits([]);
    syncStructureHp(makeInitialStructureHp());
    syncEnergy(START_ENERGY);
    syncResult("playing");
    setSelectedCardKind(null);
    setNotice("جولة جديدة بدأت.");
    nextUnitIdRef.current = 1;
    nextLaneRef.current = 0;
    botTimerRef.current = 3.2;
    botCardIndexRef.current = 0;
    lastFrameRef.current = null;
  }, [syncEnergy, syncResult, syncStructureHp, syncUnits]);

  useEffect(() => {
    function frame(now: number) {
      const previous = lastFrameRef.current ?? now;
      const deltaSeconds = Math.min((now - previous) / 1000, 0.05);
      lastFrameRef.current = now;

      if (resultRef.current === "playing") {
        if (energyRef.current < MAX_ENERGY) {
          syncEnergy(energyRef.current + deltaSeconds * ENERGY_PER_SECOND);
        }

        botTimerRef.current -= deltaSeconds;
        if (botTimerRef.current <= 0) {
          const botDeck = [CARDS[0], CARDS[2], CARDS[0], CARDS[1]];
          const pressureLane = laneFromPressure(unitsRef.current);
          const card = pressureLane && Math.random() < 0.48 ? CARDS[2] : (botDeck[botCardIndexRef.current % botDeck.length] ?? CARDS[0]);
          botCardIndexRef.current += 1;
          spawnUnit("bot", card, pressureLane ?? randomLane());
          botTimerRef.current = BOT_SPAWN_SECONDS + Math.random() * 1.25 + (botCardIndexRef.current % 2) * 0.45;
        }

        const nextStructureHp = { ...structureHpRef.current };
        const nextUnits = unitsRef.current.map((unit) => ({ ...unit }));
        const activeUnits = nextUnits.filter((unit) => unit.hp > 0);
        const frameStructures = getArenaStructures(nextStructureHp);

        for (const unit of activeUnits) {
          if (unit.hp <= 0) continue;

          const frameStartX = unit.x;
          const frameStartY = unit.y;
          unit.attackTargetX = null;
          unit.attackTargetY = null;
          unit.targetId = null;
          const enemies = activeUnits.filter((candidate) => candidate.team !== unit.team && candidate.hp > 0);
          let destination = strategicWaypoint(unit, nextStructureHp);
          let target = findLocalThreat(unit, enemies, destination);

          if (unit.mode === "defend" && !target) {
            unit.mode = "attack";
            unit.assignedBridge = nearestBridgeFromX(unit.x);
            unit.assignedLane = assignedLaneFromX(unit.x);
            unit.primaryTowerId = primaryTowerId(unit.team, unit.assignedBridge);
            unit.strategicTargetId = unit.primaryTowerId;
            unit.pathStage = isOnEnemySide(unit) ? "toTarget" : isInBridgeZone(unit, unit.assignedBridge) ? "toBridgeExit" : "toBridgeEntry";
            destination = strategicWaypoint(unit, nextStructureHp);
            target = findLocalThreat(unit, enemies, destination);
          }

          const structureTarget = target ? null : chooseStrategicStructure(unit, nextStructureHp);
          if (structureTarget) unit.strategicTargetId = structureTarget.id;
          const moveDestination: { x: number; y: number } = target ?? destination;
          const targetDistance = target
            ? distanceBetween(unit, target)
            : structureTarget
              ? distanceToStructure(unit, structureTarget)
              : distanceBetween(unit, moveDestination);
          const distanceToBuildingStop = structureTarget ? distanceBetween(unit, moveDestination) : Number.POSITIVE_INFINITY;
          const shouldAttackStructure = Boolean(
            structureTarget &&
              unit.pathStage === "toTarget" &&
              distanceToBuildingStop <= WAYPOINT_REACHED_THRESHOLD &&
              targetDistance <=
                buildingAttackEdgeRange(unit, structureTarget) +
                  (unit.kind === "swift_waiter" && unit.waiterAnimationState === "attack" ? WAITER_ATTACK_EXIT_PADDING : 0),
          );

          unit.intent = target ? (unit.mode === "defend" ? "defend" : "attack") : shouldAttackStructure ? "attack" : "advance";
          unit.targetId = target?.id ?? (structureTarget ? `structure:${structureTarget.id}` : null);

          if ((target && targetDistance <= waiterAttackDecisionRange(unit)) || shouldAttackStructure) {
            unit.state = "attacking";
            unit.attackTargetX = target?.x ?? moveDestination.x;
            unit.attackTargetY = target?.y ?? moveDestination.y;
            const attackFacingAngle = angleFromVector(
              unit.attackTargetX - unit.x,
              unit.attackTargetY - unit.y,
              unit.lastFacingAngle,
            );

            if (unit.kind === "swift_waiter") {
              if (unit.lastAttackAt <= 0 || now - unit.lastAttackAt >= unit.attackCooldown) {
                unit.lastAttackAt = now;
                unit.isAttackLocked = true;
              }

              if (unit.isAttackLocked && waiterAttackFrame(unit, now) >= WAITER_ATTACK_STRIKE_FRAME) {
                if (target) {
                  applyDamage(target, unit.damage, now);
                  if (target.hp <= 0) unit.targetId = null;
                } else if (structureTarget) {
                  damageStructure(nextStructureHp, structureTarget.id, unit.damage);
                  if (getStructureHp(nextStructureHp, structureTarget.id) <= 0) unit.targetId = null;
                }

                unit.isAttackLocked = false;
                unit.attackFxId += 1;
                unit.attackFxStartedAt = now;
              }

              updateWaiterAnimationController(unit, now, "attack", attackFacingAngle, 0);
            } else if (now - unit.lastAttackAt >= unit.attackCooldown) {
              if (target) {
                applyDamage(target, unit.damage, now);
                if (target.hp <= 0) unit.targetId = null;
              } else if (structureTarget) {
                damageStructure(nextStructureHp, structureTarget.id, unit.damage);
                if (getStructureHp(nextStructureHp, structureTarget.id) <= 0) unit.targetId = null;
              }

              unit.lastAttackAt = now;
              unit.attackFxId += 1;
              unit.attackFxStartedAt = now;
            }
            continue;
          }

          if (unit.kind === "swift_waiter") unit.isAttackLocked = false;
          unit.state = "moving";
          const desired = routePoint(unit, moveDestination, frameStructures, structureTarget?.id ?? null);
          const dx = desired.x - unit.x;
          const dy = desired.y - unit.y;
          const distance = Math.max(Math.hypot(dx, dy), 0.001);
          const lanePull = target ? 0.72 : 1;
          const step = unit.speed * MOVEMENT_SPEED_SCALE * deltaSeconds;

          const moved = keepOutsideStructures(
            {
              x: clamp(unit.x + (dx / distance) * step * lanePull, 12, 88),
              y: clamp(unit.y + (dy / distance) * step, 10, 90),
            },
            frameStructures,
            unit,
          );
          unit.x = moved.x;
          unit.y = moved.y;

          if (unit.kind === "swift_waiter") {
            const movementDistance = Math.hypot(unit.x - frameStartX, unit.y - frameStartY);
            const walkFacingAngle =
              movementDistance > WAITER_WALK_MOVEMENT_THRESHOLD
                ? angleFromVector(unit.x - frameStartX, unit.y - frameStartY, unit.lastFacingAngle)
                : unit.lastFacingAngle;
            updateWaiterAnimationController(
              unit,
              now,
              movementDistance > WAITER_WALK_MOVEMENT_THRESHOLD ? "walk" : "idle",
              walkFacingAngle,
              movementDistance,
            );
          }
        }

        for (let i = 0; i < activeUnits.length; i += 1) {
          for (let j = i + 1; j < activeUnits.length; j += 1) {
            const first = activeUnits[i];
            const second = activeUnits[j];
            if (!first || !second || first.team !== second.team || first.hp <= 0 || second.hp <= 0) continue;

            const dx = second.x - first.x;
            const dy = second.y - first.y;
            const distance = Math.max(Math.hypot(dx, dy), 0.001);
            if (distance >= MIN_SEPARATION) continue;

            const push = (MIN_SEPARATION - distance) * 0.5;
            const nx = dx / distance;
            const ny = dy / distance;
            const nextFirst = keepOutsideStructures(
              { x: clamp(first.x - nx * push, 12, 88), y: clamp(first.y - ny * push, 10, 90) },
              frameStructures,
              first,
            );
            const nextSecond = keepOutsideStructures(
              { x: clamp(second.x + nx * push, 12, 88), y: clamp(second.y + ny * push, 10, 90) },
              frameStructures,
              second,
            );
            first.x = nextFirst.x;
            first.y = nextFirst.y;
            second.x = nextSecond.x;
            second.y = nextSecond.y;
          }
        }

        for (const unit of nextUnits) {
          if (unit.kind === "swift_waiter" && unit.hp <= 0 && unit.defeatedAt !== null) {
            startWaiterDieAnimation(unit, now);
          }
        }

        for (const structure of STRUCTURE_DEFS) {
          nextStructureHp[structure.id] = clamp(nextStructureHp[structure.id], 0, structure.maxHp);
        }
        syncStructureHp(nextStructureHp);
        syncUnits(
          nextUnits.filter(
            (unit) =>
              unit.hp > 0 ||
              (unit.defeatedAt !== null &&
                (unit.kind === "swift_waiter" ? !unit.isDeadAnimationComplete : now - unit.defeatedAt < DEFEAT_ANIMATION_MS)),
          ),
        );

        if (nextStructureHp["bot-main"] <= 0) {
          syncResult("won");
          setSelectedCardKind(null);
          setNotice("فزت");
        } else if (nextStructureHp["player-main"] <= 0) {
          syncResult("lost");
          setSelectedCardKind(null);
          setNotice("خسرت");
        }
      }

      rafRef.current = window.requestAnimationFrame(frame);
    }

    rafRef.current = window.requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [spawnUnit, syncEnergy, syncResult, syncStructureHp, syncUnits]);

  const energyPercent = `${(energy / MAX_ENERGY) * 100}%`;
  const arenaStructures = getArenaStructures(structureHp);
  const renderNow = typeof performance === "undefined" ? 0 : performance.now();
  const selectedCard = CARDS.find((card) => card.kind === selectedCardKind) ?? null;

  return (
    <section className="ba-game-shell" aria-label="لعبة حلبة براندا">
      <div className="ba-game-frame overflow-hidden rounded-lg border border-[#CEB89C] bg-[#FFF9EF] shadow-[0_22px_55px_rgba(41,24,17,0.14)]">
        <div className="ba-game-topbar flex items-center justify-between gap-3 border-b border-[#E1CCAD] bg-[#FFFDF7]/95 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-[#7A4D2A]">حلبة براندا</p>
            <h2 className="text-lg font-black text-[#24140F] sm:text-xl">{resultLabel(result)}</h2>
          </div>
          <button
            type="button"
            onClick={resetGame}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#CEB89C] bg-white px-3 text-xs font-black text-[#4A281D] shadow-sm transition hover:bg-[#FFF3D6] active:scale-95 sm:text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            إعادة الجولة
          </button>
        </div>

        <div className="ba-playfield">
          <div
            className={`ba-arena relative overflow-hidden ${selectedCard ? "ba-arena-selecting" : ""}`}
            onPointerDown={deploySelectedCard}
          >
            {selectedCard ? (
              <div className="ba-deploy-overlay" aria-hidden="true">
                <span className="ba-deploy-label">منطقتك</span>
                {arenaStructures
                  .filter((structure) => structure.hp > 0 && structure.team === "player")
                  .map((structure) => (
                    <span
                      key={`blocked-${structure.id}`}
                      className="ba-deploy-block"
                      style={
                        {
                          left: `${structure.x}%`,
                          top: `${structure.y}%`,
                          width: `${(structure.collisionRadius + DEPLOYMENT_STRUCTURE_PADDING) * 2}%`,
                        } as CSSProperties
                      }
                    />
                  ))}
              </div>
            ) : null}

            {arenaStructures.map((structure) => (
              <ArenaStructureObject key={structure.id} structure={structure} />
            ))}

            <svg className="ba-attack-fx-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {units
                .filter((unit) => unit.state === "attacking" && unit.attackTargetX !== null && unit.attackTargetY !== null)
                .filter((unit) => unit.kind !== "swift_waiter" || (unit.attackFxId > 0 && renderNow - unit.attackFxStartedAt < 340))
                .map((unit) => {
                  const origin = attackOrigin(unit, unitSpriteAngle(unit));
                  const targetX = unit.attackTargetX ?? unit.x;
                  const targetY = unit.attackTargetY ?? unit.y;
                  return (
                    <g
                      key={`${unit.id}-${unit.attackFxId}`}
                      className={`ba-attack-fx ba-attack-fx-${unit.kind}`}
                      style={{ "--team": teamColor(unit.team) } as CSSProperties}
                    >
                      <line
                        className={`ba-attack-beam ba-attack-beam-${unit.kind}`}
                        x1={origin.x}
                        y1={origin.y}
                        x2={targetX}
                        y2={targetY}
                      />
                      {unit.kind === "swift_waiter" ? (
                        <circle
                          className="ba-coffee-projectile"
                          cx={(origin.x + targetX) / 2}
                          cy={(origin.y + targetY) / 2}
                          r="0.85"
                        />
                      ) : null}
                      <circle
                        className={`ba-impact-dot ba-impact-dot-${unit.kind}`}
                        cx={targetX}
                        cy={targetY}
                        r="1.5"
                      />
                    </g>
                  );
                })}
            </svg>

            {units.map((unit) => (
              <ArenaUnit key={unit.id} unit={unit} />
            ))}

            {result !== "playing" ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#24140F]/58 px-4 backdrop-blur-[2px]">
                <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center shadow-xl">
                  <p className="text-3xl font-black text-[#24140F]">{resultLabel(result)}</p>
                  <button
                    type="button"
                    onClick={resetGame}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#14645E] px-4 text-sm font-black text-white transition active:scale-95"
                  >
                    <RotateCcw className="h-4 w-4" />
                    إعادة الجولة
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ba-bottom-hud">
          <div className="ba-energy-row">
            <span className="ba-energy-icon" aria-hidden="true">
              <Zap className="h-4 w-4" />
            </span>
            <div className="ba-energy-track" aria-hidden="true">
              <div className="ba-energy-fill" style={{ width: energyPercent }} />
            </div>
            <span className="ba-energy-value">
              {Math.floor(energy)} / {MAX_ENERGY}
            </span>
          </div>

          <div className="ba-card-slots">
          {CARDS.map((card) => {
            const canPlay = result === "playing" && energy >= card.cost;
            const isSelected = selectedCardKind === card.kind;
            return (
              <button
                key={card.kind}
                type="button"
                onClick={() => selectCard(card)}
                disabled={result !== "playing"}
                className={`ba-card-button group ${isSelected ? "ba-card-selected" : ""} ${
                  canPlay ? "ba-card-ready" : "ba-card-low-energy"
                }`}
                aria-pressed={isSelected}
              >
                <span className="ba-cost-badge">{card.cost}</span>
                <span className="ba-card-avatar">
                  <UnitVisual kind={card.kind} compact />
                </span>
                <span className="ba-card-name">{card.shortName}</span>
              </button>
            );
          })}
            <div className="ba-card-future" aria-hidden="true">
              <span />
            </div>
          </div>

          <p className="ba-notice">
            {selectedCard ? (
              <>
                <span>{selectedCard.shortName}</span>
                <span>اختر مكانًا داخل منطقتك</span>
              </>
            ) : (
              notice
            )}
          </p>
        </div>
      </div>

      <style>{`
        .ba-game-shell {
          height: 100%;
          max-height: 100dvh;
          min-height: 0;
          width: 100%;
          overflow: hidden;
          overscroll-behavior: none;
        }

        .ba-game-frame {
          position: relative;
          display: flex;
          height: 100%;
          max-height: 100dvh;
          min-height: 0;
          flex-direction: column;
          overflow: hidden;
          overscroll-behavior: none;
          border: 0 !important;
          border-radius: 0 !important;
          background: #160f0c !important;
          box-shadow: none !important;
        }

        .ba-game-topbar {
          position: absolute;
          left: 10px;
          top: 10px;
          z-index: 46;
          min-height: 0;
          border: 0 !important;
          background: transparent !important;
          padding: 0 !important;
          pointer-events: none;
        }

        .ba-game-topbar > * {
          pointer-events: auto;
        }

        .ba-game-topbar p {
          display: none;
        }

        .ba-game-topbar h2 {
          border: 1px solid rgba(255, 224, 162, 0.24);
          border-radius: 999px;
          background: rgba(36, 20, 15, 0.72);
          padding: 6px 9px;
          color: #fff3d3;
          font-size: 11px;
          line-height: 1;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
          backdrop-filter: blur(8px);
        }

        .ba-game-topbar button {
          height: 32px;
          min-width: 32px;
          border-color: rgba(255, 224, 162, 0.24);
          background: rgba(36, 20, 15, 0.72);
          color: #fff3d3;
          padding-inline: 8px;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
          backdrop-filter: blur(8px);
        }

        .ba-playfield {
          display: flex;
          min-height: 0;
          flex: 1;
          flex-basis: 0;
          align-items: center;
          justify-content: center;
          background:
            linear-gradient(180deg, rgba(10, 7, 5, 0.42), rgba(36, 20, 15, 0.24)),
            #160f0c;
        }

        .ba-bottom-hud {
          position: relative;
          z-index: 40;
          flex: 0 0 auto;
          border-top: 1px solid rgba(206, 184, 156, 0.82);
          padding: 8px 10px 10px;
          background:
            linear-gradient(180deg, rgba(255, 253, 247, 0.98), rgba(244, 223, 188, 0.96)),
            #fff9ef;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.78),
            0 -12px 26px rgba(49, 25, 18, 0.16);
        }

        .ba-energy-row {
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
        }

        .ba-energy-icon {
          display: inline-flex;
          height: 24px;
          width: 24px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(122, 77, 42, 0.18);
          border-radius: 8px;
          background: #fff1c8;
          color: #8a5b00;
        }

        .ba-energy-value {
          min-width: 48px;
          color: #24140f;
          font-size: 13px;
          font-weight: 900;
          text-align: end;
        }

        .ba-energy-track {
          height: 10px;
          overflow: hidden;
          border-radius: 999px;
          border: 1px solid rgba(122, 77, 42, 0.16);
          background: linear-gradient(180deg, #d5b98c, #f3e6cf);
          box-shadow: inset 0 2px 4px rgba(74, 40, 29, 0.2);
        }

        .ba-energy-fill {
          height: 100%;
          border-radius: inherit;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.48), transparent),
            linear-gradient(90deg, #f0b33f, #d66a42, #14645e);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.38),
            0 0 12px rgba(240, 179, 63, 0.34);
          transition: width 200ms ease;
        }

        .ba-card-slots {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 7px;
          margin-top: 7px;
        }

        .ba-card-button {
          position: relative;
          overflow: hidden;
          display: grid;
          min-height: 68px;
          grid-template-rows: 1fr auto;
          align-items: center;
          justify-items: center;
          border: 1px solid rgba(214, 156, 56, 0.56);
          border-radius: 8px;
          padding: 7px 5px 6px;
          color: #24140f;
          text-align: center;
          transition:
            transform 140ms ease,
            border-color 140ms ease,
            filter 140ms ease,
            box-shadow 140ms ease;
          touch-action: manipulation;
          background:
            radial-gradient(circle at 50% 16%, rgba(255, 225, 151, 0.36), transparent 42%),
            linear-gradient(180deg, #fff8e8, #e9c792);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.78),
            0 6px 12px rgba(49, 25, 18, 0.13);
        }

        .ba-card-button:active {
          transform: scale(0.97);
        }

        .ba-card-button:disabled {
          cursor: not-allowed;
        }

        .ba-card-low-energy {
          border-color: rgba(148, 132, 113, 0.5);
          filter: saturate(0.72);
          opacity: 0.72;
        }

        .ba-card-selected {
          border-color: #14645e;
          box-shadow:
            inset 0 0 0 2px rgba(20, 100, 94, 0.5),
            0 0 0 2px rgba(255, 243, 207, 0.92),
            0 10px 18px rgba(20, 100, 94, 0.18);
          transform: translateY(-4px);
        }

        .ba-card-button::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 18% 0%, rgba(255, 225, 151, 0.38), transparent 34%);
        }

        .ba-card-button > * {
          position: relative;
          z-index: 1;
        }

        .ba-card-avatar {
          display: inline-flex;
          height: 38px;
          width: 38px;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid rgba(214, 156, 56, 0.36);
          background:
            radial-gradient(circle at 50% 34%, rgba(255, 248, 219, 0.9), transparent 62%),
            linear-gradient(180deg, #f4dcb7, #c9955f);
        }

        .ba-cost-badge {
          position: absolute;
          top: 5px;
          inset-inline-start: 5px;
          display: inline-flex;
          height: 22px;
          min-width: 22px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding-inline: 6px;
          border: 1px solid rgba(255, 232, 178, 0.48);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.22), transparent),
            #14645e;
          color: white;
          font-size: 11px;
          font-weight: 900;
          box-shadow: 0 3px 8px rgba(20, 9, 5, 0.14);
        }

        .ba-card-name {
          display: block;
          max-width: 100%;
          overflow: hidden;
          color: #3d2419;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ba-card-future {
          display: grid;
          min-height: 68px;
          place-items: center;
          border: 1px dashed rgba(122, 77, 42, 0.3);
          border-radius: 8px;
          background:
            linear-gradient(180deg, rgba(255, 253, 247, 0.72), rgba(214, 190, 155, 0.32)),
            rgba(255, 249, 239, 0.62);
        }

        .ba-card-future span {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background:
            linear-gradient(90deg, transparent 44%, rgba(122, 77, 42, 0.28) 45% 55%, transparent 56%),
            linear-gradient(0deg, transparent 44%, rgba(122, 77, 42, 0.28) 45% 55%, transparent 56%);
        }

        .ba-notice {
          display: flex;
          min-height: 18px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 6px;
          color: #5c3b2b;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.25;
          text-align: center;
        }

        .ba-notice span:first-child {
          color: #14645e;
        }

        .ba-deploy-overlay {
          position: absolute;
          left: ${DEPLOYMENT_ZONE.minX}%;
          top: ${DEPLOYMENT_ZONE.minY}%;
          z-index: 14;
          width: ${DEPLOYMENT_ZONE.maxX - DEPLOYMENT_ZONE.minX}%;
          height: ${DEPLOYMENT_ZONE.maxY - DEPLOYMENT_ZONE.minY}%;
          pointer-events: none;
          border: 1px solid rgba(20, 100, 94, 0.46);
          border-radius: 18px;
          background:
            linear-gradient(180deg, rgba(255, 243, 207, 0.22), rgba(20, 100, 94, 0.16)),
            repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0 8px, transparent 8px 18px);
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.38),
            0 0 22px rgba(20, 100, 94, 0.16);
        }

        .ba-deploy-label {
          position: absolute;
          left: 50%;
          bottom: 8px;
          transform: translateX(-50%);
          border-radius: 999px;
          padding: 4px 9px;
          background: rgba(36, 20, 15, 0.72);
          color: #fff3d3;
          font-size: 11px;
          font-weight: 900;
          white-space: nowrap;
        }

        .ba-deploy-block {
          position: absolute;
          aspect-ratio: 1;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 1px dashed rgba(124, 41, 72, 0.52);
          background: rgba(124, 41, 72, 0.16);
        }

        .ba-arena {
          isolation: isolate;
          background:
            radial-gradient(circle at 50% 34%, rgba(255, 234, 181, 0.42), transparent 34%),
            radial-gradient(circle at 14% 12%, rgba(255, 213, 142, 0.3), transparent 24%),
            radial-gradient(circle at 88% 12%, rgba(113, 203, 190, 0.2), transparent 24%),
            linear-gradient(180deg, #321b14 0%, #71412a 18%, #c08a55 54%, #5d3323 100%);
          box-shadow:
            inset 0 0 0 1px rgba(255, 224, 162, 0.5),
            inset 0 34px 90px rgba(15, 8, 5, 0.48),
            inset 0 -44px 95px rgba(15, 8, 5, 0.48);
        }

        .ba-arena::before,
        .ba-arena::after {
          content: "";
          position: absolute;
          inset-inline: 0;
          z-index: 9;
          pointer-events: none;
        }

        .ba-arena::before {
          top: 0;
          height: 18%;
          background:
            linear-gradient(180deg, rgba(29, 15, 10, 0.72), transparent),
            radial-gradient(ellipse at center, rgba(255, 218, 141, 0.22), transparent 62%);
        }

        .ba-arena::after {
          bottom: 0;
          height: 17%;
          background:
            radial-gradient(ellipse at 50% 100%, rgba(33, 16, 10, 0.72), transparent 68%),
            linear-gradient(0deg, rgba(26, 13, 9, 0.58), transparent);
        }

        .ba-cafe-backdrop {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }

        .ba-cafe-shelf {
          position: absolute;
          left: 23%;
          right: 23%;
          top: 3%;
          height: 9%;
          border-radius: 0 0 16px 16px;
          border: 1px solid rgba(255, 214, 140, 0.28);
          background: linear-gradient(180deg, #7d4a31, #4a291b);
          box-shadow:
            0 14px 22px rgba(20, 10, 7, 0.36),
            inset 0 1px 0 rgba(255, 232, 186, 0.22);
        }

        .ba-shelf-grinder,
        .ba-shelf-cups,
        .ba-shelf-menu {
          position: absolute;
          bottom: 18%;
          background: linear-gradient(180deg, #f5d291, #80522e);
          box-shadow: 0 5px 8px rgba(20, 10, 7, 0.28);
        }

        .ba-shelf-grinder {
          left: 16%;
          width: 30px;
          height: 38px;
          border-radius: 16px 16px 7px 7px;
        }

        .ba-shelf-grinder::before {
          content: "";
          position: absolute;
          left: 6px;
          right: 6px;
          top: -10px;
          height: 13px;
          border-radius: 50% 50% 4px 4px;
          background: #1f1715;
        }

        .ba-shelf-cups {
          left: 43%;
          width: 70px;
          height: 24px;
          border-radius: 9px 9px 6px 6px;
          background:
            radial-gradient(circle at 15px 10px, #fff8e8 0 7px, transparent 8px),
            radial-gradient(circle at 36px 10px, #fff8e8 0 7px, transparent 8px),
            radial-gradient(circle at 57px 10px, #fff8e8 0 7px, transparent 8px),
            linear-gradient(180deg, #7d4a31, #3b2118);
        }

        .ba-shelf-menu {
          right: 15%;
          width: 42px;
          height: 48px;
          border-radius: 4px;
          background:
            linear-gradient(180deg, rgba(255, 216, 144, 0.22), transparent),
            #2e241d;
          border: 2px solid #b78143;
        }

        .ba-cafe-plant {
          position: absolute;
          top: 3.5%;
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background:
            radial-gradient(ellipse at 24% 32%, #98a94f 0 18%, transparent 19%),
            radial-gradient(ellipse at 58% 30%, #718437 0 20%, transparent 21%),
            radial-gradient(ellipse at 38% 66%, #63752f 0 22%, transparent 23%),
            radial-gradient(circle at 50% 70%, #5a3420 0 22%, transparent 23%);
          filter: drop-shadow(0 10px 12px rgba(13, 8, 5, 0.35));
        }

        .ba-cafe-plant-left {
          left: 8%;
        }

        .ba-cafe-plant-right {
          right: 8%;
        }

        .ba-corner-lamp {
          position: absolute;
          top: 11%;
          z-index: 8;
          width: 15px;
          height: 54px;
          border-radius: 999px;
          background: linear-gradient(180deg, #ffe09a, #6d4029);
          box-shadow: 0 0 20px rgba(255, 215, 134, 0.38);
        }

        .ba-corner-lamp::before {
          content: "";
          position: absolute;
          left: 50%;
          top: -8px;
          width: 28px;
          height: 24px;
          transform: translateX(-50%);
          border-radius: 14px 14px 7px 7px;
          background: radial-gradient(circle, #fff3c5, #7b4a2e 70%);
        }

        .ba-corner-lamp-left {
          left: 5.5%;
        }

        .ba-corner-lamp-right {
          right: 5.5%;
        }

        .ba-rail {
          position: absolute;
          left: 9%;
          right: 9%;
          z-index: 7;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, #7d4c29, #f4cd7a, #8a552e);
          box-shadow: 0 4px 10px rgba(26, 12, 7, 0.34);
        }

        .ba-rail-top {
          top: 17%;
        }

        .ba-rail-bottom {
          bottom: 9%;
        }

        .ba-team-carpet {
          position: absolute;
          top: 16%;
          bottom: 9%;
          z-index: 2;
          width: 13%;
          opacity: 0.88;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.08) 25%, transparent 25% 50%, rgba(255, 255, 255, 0.08) 50% 75%, transparent 75%),
            var(--team);
          background-size: 22px 22px, 100% 100%;
          box-shadow: inset 0 0 34px rgba(255, 222, 160, 0.18);
        }

        .ba-team-carpet-player {
          --team: #7c2948;
          left: 0;
        }

        .ba-team-carpet-bot {
          --team: #14645e;
          right: 0;
        }

        .ba-floor {
          position: absolute;
          inset: 17% 8.5% 9%;
          z-index: 3;
          overflow: hidden;
          border-radius: 22px;
          border: 2px solid rgba(225, 168, 84, 0.82);
          background:
            linear-gradient(90deg, rgba(116, 71, 37, 0.13) 1px, transparent 1px),
            linear-gradient(0deg, rgba(116, 71, 37, 0.12) 1px, transparent 1px),
            radial-gradient(circle at 50% 47%, rgba(255, 247, 218, 0.96), rgba(231, 190, 135, 0.86) 58%, rgba(185, 122, 68, 0.78));
          background-size: 42px 42px, 42px 42px, 100% 100%;
          box-shadow:
            0 24px 54px rgba(20, 9, 5, 0.42),
            inset 0 0 0 5px rgba(105, 57, 30, 0.22),
            inset 0 28px 48px rgba(255, 255, 255, 0.22),
            inset 0 -24px 42px rgba(99, 52, 28, 0.16);
        }

        .ba-floor::after {
          content: "";
          position: absolute;
          inset: 3% 4%;
          border-radius: 18px;
          border: 1px solid rgba(255, 248, 225, 0.72);
          box-shadow:
            inset 0 30px 55px rgba(255, 255, 255, 0.22),
            inset 0 -24px 45px rgba(84, 48, 31, 0.16);
          transform: perspective(720px) rotateX(4deg);
        }

        .ba-watermark {
          position: absolute;
          left: 50%;
          top: 56%;
          z-index: 4;
          width: 210px;
          height: 120px;
          transform: translate(-50%, -50%);
          color: rgba(143, 86, 41, 0.16);
          pointer-events: none;
          text-align: center;
        }

        .ba-watermark-bean {
          position: relative;
          display: block;
          width: 72px;
          height: 52px;
          margin: 0 auto 4px;
          border: 7px solid currentColor;
          border-radius: 52% 48% 48% 52%;
          transform: rotate(-18deg);
        }

        .ba-watermark-bean::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 8px;
          width: 8px;
          height: 34px;
          border-radius: 999px;
          background: currentColor;
          transform: translateX(-50%) rotate(14deg);
        }

        .ba-watermark-text {
          display: block;
          font-family: Georgia, serif;
          font-size: 34px;
          font-weight: 900;
          letter-spacing: 0;
        }

        .ba-center-line {
          position: absolute;
          inset-block: 18% 10%;
          left: 50%;
          z-index: 5;
          width: 6px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: linear-gradient(180deg, transparent, rgba(195, 121, 52, 0.7), transparent);
          box-shadow:
            0 0 20px rgba(255, 229, 170, 0.65),
            inset 0 0 0 1px rgba(91, 45, 23, 0.2);
        }

        .ba-side-line {
          position: absolute;
          inset-block: 18% 10%;
          z-index: 5;
          width: 4px;
          border-radius: 999px;
          opacity: 0.55;
        }

        .ba-side-line-player {
          left: 12%;
          background: #7c2948;
        }

        .ba-side-line-bot {
          right: 12%;
          background: #14645e;
        }

        .ba-lane {
          position: absolute;
          left: 13%;
          right: 13%;
          z-index: 6;
          height: 58px;
          transform: translateY(-50%) perspective(760px) rotateX(7deg);
          border-radius: 999px;
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.14), rgba(255, 250, 229, 0.56), rgba(255, 255, 255, 0.14)),
            linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(177, 112, 58, 0.08));
          box-shadow:
            0 9px 18px rgba(78, 43, 24, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            inset 0 -18px 30px rgba(96, 56, 35, 0.1);
        }

        .ba-lane span {
          position: absolute;
          inset: 50% 18px auto;
          height: 2px;
          transform: translateY(-50%);
          background: linear-gradient(90deg, transparent, rgba(122, 77, 42, 0.24), transparent);
        }

        .ba-base {
          position: absolute;
          top: 50%;
          z-index: 12;
          width: 118px;
          transform: translateY(-50%);
          text-align: center;
          color: #24140f;
          filter: drop-shadow(0 20px 18px rgba(20, 9, 5, 0.34));
        }

        .ba-defense-zone {
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: -1;
          width: 176px;
          height: 176px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 1px dashed color-mix(in srgb, var(--team) 42%, transparent);
          background: radial-gradient(circle, color-mix(in srgb, var(--team) 10%, transparent), transparent 68%);
          opacity: 0.75;
        }

        .ba-base-player {
          left: 8px;
        }

        .ba-base-bot {
          right: 8px;
        }

        .ba-base-flag {
          position: absolute;
          top: -112px;
          left: 50%;
          width: 46px;
          height: 78px;
          transform: translateX(-50%);
          border-radius: 9px 9px 16px 16px;
          border: 2px solid #d6aa5d;
          background:
            radial-gradient(circle at 50% 38%, rgba(255, 244, 212, 0.92) 0 7px, transparent 8px),
            linear-gradient(180deg, color-mix(in srgb, var(--team) 88%, #000), var(--team));
          box-shadow:
            0 10px 20px rgba(20, 9, 5, 0.26),
            inset 0 0 0 1px rgba(255, 240, 196, 0.18);
        }

        .ba-base-flag::before {
          content: "";
          position: absolute;
          left: 50%;
          top: -15px;
          width: 58px;
          height: 8px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: linear-gradient(90deg, #7f4d26, #f5d17c, #7f4d26);
        }

        .ba-base-flag::after {
          content: "";
          position: absolute;
          left: 50%;
          top: -24px;
          width: 12px;
          height: 12px;
          transform: translateX(-50%);
          border-radius: 50%;
          background: #ffd884;
          box-shadow: 0 0 12px rgba(255, 216, 132, 0.55);
        }

        .ba-flag-mark {
          position: absolute;
          left: 50%;
          top: 30px;
          width: 22px;
          height: 17px;
          transform: translateX(-50%) rotate(-22deg);
          border-radius: 50%;
          background: #fff4d3;
        }

        .ba-flag-mark::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 2px;
          width: 4px;
          height: 14px;
          transform: translateX(-50%) rotate(17deg);
          border-radius: 999px;
          background: color-mix(in srgb, var(--team) 72%, #3c2116);
        }

        .ba-base-rail {
          position: absolute;
          left: 50%;
          top: -6px;
          width: 148px;
          height: 116px;
          transform: translateX(-50%);
          border: 4px solid rgba(225, 171, 89, 0.82);
          border-radius: 44px 44px 18px 18px;
          border-bottom-color: transparent;
          box-shadow:
            inset 0 0 18px rgba(255, 224, 151, 0.2),
            0 12px 22px rgba(20, 9, 5, 0.2);
        }

        .ba-base-machine-shell {
          position: relative;
          z-index: 2;
          height: 76px;
          margin-inline: 15px;
          border-radius: 32px 32px 12px 12px;
          border: 2px solid rgba(139, 84, 40, 0.5);
          background:
            radial-gradient(circle at 50% 18%, rgba(255, 255, 255, 0.95) 0 14px, transparent 15px),
            linear-gradient(180deg, #fff2d8, #d39a62 58%, color-mix(in srgb, var(--team) 55%, #4b2a1b));
          box-shadow:
            inset 0 8px 16px rgba(255, 255, 255, 0.42),
            inset 0 -13px 16px rgba(47, 25, 15, 0.18),
            0 16px 20px rgba(20, 9, 5, 0.24);
        }

        .ba-base-dial {
          position: absolute;
          left: 50%;
          top: 20px;
          width: 20px;
          height: 20px;
          transform: translateX(-50%);
          border-radius: 50%;
          border: 3px solid #a56e36;
          background: #fff6df;
        }

        .ba-base-portafilter {
          position: absolute;
          left: 50%;
          top: 46px;
          width: 42px;
          height: 9px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #4b2a1d;
          box-shadow: 18px 5px 0 -2px #4b2a1d;
        }

        .ba-base-canopy {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          position: relative;
          z-index: 3;
          height: 18px;
          margin-inline: 7px;
          margin-top: -1px;
          overflow: hidden;
          border-radius: 7px 7px 3px 3px;
          border: 1px solid #d9a65b;
          background: #fff8e7;
          box-shadow: 0 8px 14px rgba(42, 24, 16, 0.16);
        }

        .ba-base-canopy span:nth-child(odd) {
          background: var(--team);
        }

        .ba-base-canopy span:nth-child(even) {
          background: #fff2cf;
        }

        .ba-base-counter {
          position: relative;
          z-index: 3;
          height: 76px;
          margin-inline: 3px;
          border-radius: 8px 8px 17px 17px;
          border: 1px solid rgba(74, 40, 29, 0.22);
          background:
            linear-gradient(180deg, rgba(255, 246, 223, 0.9), transparent 34%),
            linear-gradient(180deg, color-mix(in srgb, var(--team) 32%, #fff4d8), color-mix(in srgb, var(--team) 44%, #6f3c24));
          box-shadow:
            0 14px 24px rgba(42, 24, 16, 0.24),
            inset 0 1px 0 rgba(255, 255, 255, 0.85);
        }

        .ba-base-machine {
          position: absolute;
          left: 19px;
          bottom: 19px;
          width: 32px;
          height: 30px;
          border-radius: 8px 8px 5px 5px;
          background: linear-gradient(180deg, #44595b, #182a2b);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
        }

        .ba-base-machine::after {
          content: "";
          position: absolute;
          right: -13px;
          top: 9px;
          width: 17px;
          height: 4px;
          border-radius: 999px;
          background: #182a2b;
        }

        .ba-base-cups {
          position: absolute;
          right: 18px;
          bottom: 14px;
          width: 32px;
          height: 28px;
          border-radius: 4px 4px 12px 12px;
          border: 3px solid #fff4d6;
          background:
            radial-gradient(circle at 50% 24%, #ead29c 0 8px, transparent 9px),
            color-mix(in srgb, var(--team) 68%, #ffffff);
          box-shadow:
            0 8px 12px rgba(20, 9, 5, 0.18),
            inset 0 -5px 0 rgba(40, 22, 15, 0.12);
        }

        .ba-base-cups::after {
          content: "";
          position: absolute;
          right: -11px;
          top: 8px;
          width: 12px;
          height: 10px;
          border: 3px solid #fff4d6;
          border-left: 0;
          border-radius: 0 999px 999px 0;
        }

        .ba-base-cup-foam {
          position: absolute;
          right: 24px;
          bottom: 39px;
          width: 20px;
          height: 6px;
          border-radius: 50%;
          background: #fff6da;
          box-shadow: 0 0 10px rgba(255, 244, 210, 0.7);
        }

        .ba-base-label,
        .ba-base-hp {
          margin: 4px 0 0;
          font-size: 11px;
          font-weight: 900;
        }

        .ba-base-label {
          height: 21px;
          margin-inline: 12px;
          border-radius: 3px 3px 8px 8px;
          background: linear-gradient(180deg, #5b321f, #2b1710);
          box-shadow:
            inset 0 0 0 1px rgba(255, 209, 129, 0.3),
            0 8px 12px rgba(20, 9, 5, 0.2);
          color: transparent;
          font-size: 0;
          line-height: 21px;
        }

        .ba-base-label::after {
          content: "BRANDA";
          color: #ffe3a2;
          font-family: Georgia, serif;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0;
        }

        .ba-base-health {
          height: 9px;
          margin: 6px 14px 0;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 244, 217, 0.72);
          box-shadow:
            inset 0 0 0 1px rgba(74, 40, 29, 0.16),
            0 3px 8px rgba(20, 9, 5, 0.18);
        }

        .ba-base-health span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: var(--team);
          transition: width 180ms ease;
        }

        .ba-attack-fx-layer {
          position: absolute;
          inset: 0;
          z-index: 19;
          pointer-events: none;
          overflow: visible;
        }

        .ba-attack-beam {
          stroke: var(--team);
          stroke-width: 0.8;
          stroke-linecap: round;
          stroke-dasharray: 1.4 1;
          filter:
            drop-shadow(0 0 3px rgba(255, 243, 207, 0.88))
            drop-shadow(0 0 7px color-mix(in srgb, var(--team) 42%, transparent));
          animation: ba-beam 340ms ease-out forwards;
        }

        .ba-attack-beam-swift_waiter {
          stroke: #7a3f24;
          stroke-width: 1.15;
          stroke-dasharray: 2.3 1.7;
        }

        .ba-coffee-projectile {
          fill: #6a351f;
          stroke: #fff2d2;
          stroke-width: 0.32;
          filter:
            drop-shadow(0 0 2px rgba(255, 242, 210, 0.9))
            drop-shadow(0 0 4px rgba(106, 53, 31, 0.55));
          animation: ba-coffee-projectile 280ms ease-out forwards;
        }

        .ba-attack-beam-strong_chef {
          stroke: #5a2e1d;
          stroke-width: 1.35;
          stroke-dasharray: 0.9 1.4;
        }

        .ba-attack-beam-branch_guard {
          stroke: #f6c45a;
          stroke-width: 1.25;
          stroke-dasharray: 1.8 1.6;
        }

        .ba-impact-dot {
          fill: #fff2c8;
          stroke: var(--team);
          stroke-width: 0.55;
          transform-box: fill-box;
          transform-origin: center;
          filter: drop-shadow(0 0 5px rgba(255, 232, 181, 0.78));
          animation: ba-impact-dot 340ms ease-out forwards;
        }

        .ba-impact-dot-strong_chef {
          fill: #5a2e1d;
          stroke: #f0b96a;
        }

        .ba-impact-dot-branch_guard {
          fill: #f6c45a;
          stroke: #7a4d2a;
        }

        .ba-unit {
          position: absolute;
          width: clamp(34px, 7vw, 58px);
          height: clamp(48px, 9vw, 74px);
          transform: translate(-50%, -100%) scale(var(--depth));
          transform-origin: center bottom;
          pointer-events: none;
          overflow: visible;
        }

        .ba-unit-defeated {
          animation: ba-defeat 420ms ease forwards;
        }

        .ba-unit-kind-swift_waiter.ba-unit-defeated {
          animation: ba-waiter-defeat 420ms ease forwards;
        }

        .ba-unit-visual {
          position: relative;
          display: block;
          width: 100%;
          height: 100%;
          transform-origin: center bottom;
        }

        .ba-unit-ground {
          position: absolute;
          left: 50%;
          bottom: -2px;
          width: 62%;
          height: 14%;
          transform: translateX(-50%);
          border-radius: 50%;
          background: rgba(27, 14, 9, 0.28);
          filter: blur(1px);
        }

        .ba-unit-placeholder {
          position: absolute;
          left: 50%;
          bottom: 0;
          display: grid;
          width: 72%;
          height: 86%;
          transform: translateX(-50%);
          place-items: center;
          overflow: visible;
        }

        .ba-unit-placeholder-body {
          position: relative;
          width: 14px;
          height: 19px;
          border: 1px solid rgba(255, 243, 207, 0.5);
          border-radius: 9px 9px 7px 7px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 40%),
            var(--team);
          box-shadow:
            inset 0 -5px 0 rgba(36, 20, 15, 0.18),
            0 5px 8px rgba(20, 9, 5, 0.18);
        }

        .ba-unit-placeholder-head {
          position: absolute;
          left: 50%;
          top: -7px;
          width: 10px;
          height: 10px;
          transform: translateX(-50%);
          border-radius: 50%;
          background: #d89562;
          box-shadow: inset 0 -2px 0 rgba(80, 37, 24, 0.18);
        }

        .ba-unit-placeholder-mark {
          position: absolute;
          left: 50%;
          top: 6px;
          width: 5px;
          height: 6px;
          transform: translateX(-50%);
          border-radius: 2px;
          background: rgba(255, 246, 218, 0.85);
        }

        .ba-unit-visual-strong_chef .ba-unit-placeholder-body {
          width: 16px;
          height: 21px;
          border-radius: 10px 10px 8px 8px;
          background:
            linear-gradient(180deg, #fffdf7 0 48%, transparent 49%),
            #bf4c34;
        }

        .ba-unit-visual-branch_guard .ba-unit-placeholder-body {
          width: 15px;
          height: 22px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.16), transparent 36%),
            #3f5e64;
        }

        .ba-unit-visual-branch_guard .ba-unit-placeholder-mark {
          clip-path: polygon(50% 0, 100% 24%, 84% 78%, 50% 100%, 16% 78%, 0 24%);
          background: #f6c45a;
        }

        .ba-unit-visual-walk .ba-unit-placeholder {
          animation: ba-unit-walk 540ms ease-in-out infinite;
        }

        .ba-unit-visual-attack .ba-unit-placeholder {
          animation: ba-unit-attack 360ms ease-in-out infinite;
        }

        .ba-unit-visual-die {
          opacity: 0.72;
        }

        .ba-unit-sprite {
          position: absolute;
          left: 50%;
          bottom: 0;
          z-index: 2;
          width: 100%;
          height: 100%;
          transform: translateX(-50%);
          object-fit: contain;
          object-position: center bottom;
        }

        .ba-unit-visual-idle.ba-unit-visual-swift_waiter .ba-unit-sprite {
          animation: none;
        }

        .ba-unit-visual-walk.ba-unit-visual-swift_waiter .ba-unit-sprite {
          animation: none;
        }

        .ba-unit-visual-attack.ba-unit-visual-swift_waiter .ba-unit-sprite {
          animation: none;
        }

        .ba-unit-visual-hit.ba-unit-visual-swift_waiter .ba-unit-sprite {
          animation: ba-waiter-hit 180ms ease-out infinite;
        }

        .ba-unit-visual-run_to_stop.ba-unit-visual-swift_waiter .ba-unit-sprite {
          animation: none;
        }

        .ba-unit-visual-die.ba-unit-visual-swift_waiter .ba-unit-sprite {
          animation: none;
        }

        .ba-unit-visual-swift_waiter.ba-unit-visual-walk .ba-unit-placeholder,
        .ba-unit-visual-swift_waiter.ba-unit-visual-run_to_stop .ba-unit-placeholder,
        .ba-unit-visual-swift_waiter.ba-unit-visual-attack .ba-unit-placeholder {
          animation: none;
        }

        .ba-unit-sprite:not([hidden]) ~ .ba-unit-placeholder-body {
          display: none;
        }

        .ba-unit-visual-compact {
          width: 36px;
          height: 36px;
          transform: scale(0.88);
        }

        .ba-unit-visual-compact .ba-unit-ground {
          width: 26px;
          height: 8px;
        }

        .ba-unit-visual-compact .ba-unit-placeholder {
          width: 24px;
          height: 30px;
        }

        .ba-character {
          position: relative;
          display: inline-block;
          width: 68px;
          height: 74px;
        }

        .ba-character-mini {
          width: 46px;
          height: 48px;
          transform: scale(0.68);
          transform-origin: center bottom;
        }

        .ba-shadow {
          position: absolute;
          left: 7px;
          right: 7px;
          bottom: 0;
          height: 12px;
          border-radius: 50%;
          background: rgba(43, 26, 17, 0.28);
          filter: blur(1.5px);
          animation: ba-shadow 640ms ease-in-out infinite;
        }

        .ba-sprite {
          position: absolute;
          inset: 0;
          animation: ba-bob 640ms ease-in-out infinite;
        }

        .ba-attacking .ba-sprite {
          animation: ba-strike 360ms ease-in-out infinite;
        }

        .ba-swift_waiter.ba-moving .ba-sprite {
          animation: ba-run 480ms ease-in-out infinite;
        }

        .ba-branch_guard.ba-moving .ba-sprite {
          animation-duration: 780ms;
        }

        .ba-figure {
          position: absolute;
          left: 13px;
          bottom: 10px;
          width: 42px;
          height: 58px;
          transform: scaleX(var(--face));
          transform-origin: center bottom;
        }

        .ba-head {
          position: absolute;
          left: 10px;
          top: 3px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: linear-gradient(180deg, #f1bd84, #c9784d);
          box-shadow:
            inset 0 -2px 0 rgba(80, 37, 24, 0.18),
            0 3px 4px rgba(36, 20, 15, 0.12);
        }

        .ba-hair {
          position: absolute;
          left: 1px;
          top: -2px;
          width: 17px;
          height: 8px;
          border-radius: 8px 8px 4px 4px;
          background: #38231d;
        }

        .ba-face-detail {
          position: absolute;
          left: 5px;
          top: 8px;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #2a1712;
          box-shadow:
            8px 0 0 #2a1712,
            4px 6px 0 -1px rgba(105, 46, 30, 0.78);
        }

        .ba-body {
          position: absolute;
          left: 7px;
          top: 23px;
          width: 28px;
          height: 28px;
          border-radius: 11px 11px 8px 8px;
          background:
            linear-gradient(90deg, transparent 47%, rgba(255, 255, 255, 0.28) 48% 52%, transparent 53%),
            linear-gradient(180deg, #fffdf7 0 39%, var(--team) 40% 100%);
          box-shadow:
            inset 0 0 0 1px rgba(36, 20, 15, 0.12),
            0 8px 12px rgba(36, 20, 15, 0.14);
        }

        .ba-collar {
          position: absolute;
          left: 4px;
          top: 1px;
          width: 20px;
          height: 12px;
          background:
            linear-gradient(135deg, #fffdf7 0 47%, transparent 48%),
            linear-gradient(225deg, #fffdf7 0 47%, transparent 48%);
        }

        .ba-apron {
          position: absolute;
          left: 8px;
          top: 8px;
          width: 12px;
          height: 18px;
          border-radius: 0 0 5px 5px;
          background: rgba(255, 255, 255, 0.88);
        }

        .ba-belt {
          position: absolute;
          left: 3px;
          right: 3px;
          bottom: 6px;
          height: 4px;
          border-radius: 999px;
          background: rgba(44, 25, 19, 0.72);
        }

        .ba-swift_waiter .ba-body {
          background:
            linear-gradient(90deg, transparent 47%, rgba(255, 255, 255, 0.28) 48% 52%, transparent 53%),
            linear-gradient(180deg, #fffdf7 0 35%, var(--team) 36% 100%);
        }

        .ba-strong_chef .ba-body {
          background:
            linear-gradient(90deg, transparent 47%, rgba(191, 72, 49, 0.22) 48% 52%, transparent 53%),
            linear-gradient(180deg, #fffdf7 0 72%, #d64d34 73% 100%);
        }

        .ba-branch_guard .ba-body {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 36%),
            linear-gradient(180deg, #3f5e64, var(--team));
        }

        .ba-shield-mark {
          position: absolute;
          left: 9px;
          top: 8px;
          width: 11px;
          height: 13px;
          clip-path: polygon(50% 0, 100% 20%, 88% 78%, 50% 100%, 12% 78%, 0 20%);
          background: #f6c45a;
        }

        .ba-arm,
        .ba-leg {
          position: absolute;
          background: #5c3430;
        }

        .ba-arm {
          top: 27px;
          width: 8px;
          height: 24px;
          border-radius: 999px;
          transform-origin: top center;
          animation: ba-arm-swing 640ms ease-in-out infinite;
        }

        .ba-arm-left {
          left: 2px;
        }

        .ba-arm-right {
          right: 2px;
          animation-delay: -320ms;
        }

        .ba-attacking .ba-arm-right {
          animation: ba-attack-arm 360ms ease-in-out infinite;
        }

        .ba-leg {
          bottom: 0;
          width: 9px;
          height: 18px;
          border-radius: 999px 999px 4px 4px;
          transform-origin: top center;
          animation: ba-step 640ms ease-in-out infinite;
        }

        .ba-leg::after {
          content: "";
          position: absolute;
          left: -2px;
          bottom: -3px;
          width: 13px;
          height: 5px;
          border-radius: 999px;
          background: #24140f;
        }

        .ba-leg-left {
          left: 9px;
        }

        .ba-leg-right {
          right: 9px;
          animation-delay: -320ms;
        }

        .ba-chef-hat {
          position: absolute;
          left: -5px;
          top: -12px;
          width: 29px;
          height: 17px;
        }

        .ba-chef-hat span {
          position: absolute;
          bottom: 0;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fffdf7;
          box-shadow: inset 0 -1px 0 rgba(36, 20, 15, 0.12);
        }

        .ba-chef-hat span:nth-child(1) {
          left: 0;
        }

        .ba-chef-hat span:nth-child(2) {
          left: 8px;
          top: -2px;
        }

        .ba-chef-hat span:nth-child(3) {
          right: 0;
        }

        .ba-cap {
          position: absolute;
          left: -3px;
          top: -6px;
          width: 25px;
          height: 10px;
          border-radius: 9px 9px 3px 3px;
          background: #20383a;
        }

        .ba-cap::after {
          content: "";
          position: absolute;
          right: -6px;
          bottom: 0;
          width: 10px;
          height: 4px;
          border-radius: 999px;
          background: #20383a;
        }

        .ba-bowtie {
          position: absolute;
          left: 7px;
          bottom: -7px;
          width: 8px;
          height: 6px;
          background: var(--team);
          clip-path: polygon(0 0, 50% 45%, 100% 0, 100% 100%, 50% 55%, 0 100%);
        }

        .ba-accessory {
          position: absolute;
          z-index: 2;
        }

        .ba-tray {
          right: -12px;
          top: 29px;
          width: 28px;
          height: 18px;
          transform-origin: left center;
        }

        .ba-tray-plate {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 29px;
          height: 6px;
          border-radius: 50%;
          background: linear-gradient(180deg, #526568, #202d2f);
          box-shadow: 0 3px 4px rgba(20, 9, 5, 0.25);
        }

        .ba-cup {
          position: absolute;
          left: 10px;
          top: -1px;
          width: 10px;
          height: 12px;
          border-radius: 2px 2px 5px 5px;
          background: #fffdf7;
          border: 1px solid #2e4042;
        }

        .ba-cup::after {
          content: "";
          position: absolute;
          right: -5px;
          top: 3px;
          width: 5px;
          height: 5px;
          border: 1px solid #2e4042;
          border-left: 0;
          border-radius: 0 999px 999px 0;
        }

        .ba-steam {
          position: absolute;
          left: 13px;
          top: -9px;
          width: 4px;
          height: 11px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.8), transparent);
          animation: ba-steam 900ms ease-in-out infinite;
        }

        .ba-pan {
          right: -17px;
          top: 31px;
          width: 35px;
          height: 18px;
          transform-origin: left center;
        }

        .ba-pan-head {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 22px;
          height: 15px;
          border-radius: 50%;
          background: #273234;
          box-shadow: inset 0 -2px 0 rgba(255, 255, 255, 0.16);
        }

        .ba-pan-handle {
          position: absolute;
          left: 0;
          bottom: 6px;
          width: 20px;
          height: 5px;
          border-radius: 999px;
          background: #273234;
        }

        .ba-bean {
          position: absolute;
          width: 6px;
          height: 8px;
          border-radius: 50%;
          background: #5a2e1d;
          box-shadow: inset 2px 0 0 rgba(255, 211, 147, 0.2);
          opacity: 0;
        }

        .ba-bean-one {
          left: 19px;
          top: -7px;
        }

        .ba-bean-two {
          left: 28px;
          top: -2px;
        }

        .ba-accessory-active .ba-bean-one {
          animation: ba-bean-pop 520ms ease-out infinite;
        }

        .ba-accessory-active .ba-bean-two {
          animation: ba-bean-pop 520ms 120ms ease-out infinite;
        }

        .ba-badge-shield {
          right: -12px;
          top: 25px;
          width: 30px;
          height: 34px;
          transform-origin: left center;
        }

        .ba-badge-shield svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 4px 4px rgba(36, 20, 15, 0.18));
        }

        .ba-badge-shield path:first-child {
          fill: #f6c45a;
          stroke: #7a4d2a;
          stroke-width: 2;
        }

        .ba-badge-shield path:last-child {
          fill: none;
          stroke: #7a4d2a;
          stroke-linecap: round;
          stroke-width: 2;
        }

        .ba-accessory-active {
          animation: ba-accessory-strike 360ms ease-in-out infinite;
        }

        .ba-hp-track {
          position: absolute;
          left: 12%;
          right: 12%;
          top: -7px;
          height: 5px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(35, 20, 15, 0.42);
          border: 1px solid rgba(255, 232, 184, 0.72);
          box-shadow:
            0 4px 7px rgba(25, 12, 7, 0.24),
            inset 0 0 0 1px rgba(36, 20, 15, 0.1);
        }

        .ba-hp-fill {
          display: block;
          width: var(--hp);
          height: 100%;
          border-radius: inherit;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.38), transparent),
            var(--team);
          transition: width 140ms ease;
        }

        .ba-attack-ring,
        .ba-target-lock,
        .ba-hit-flash {
          position: absolute;
          pointer-events: none;
        }

        .ba-target-lock {
          left: 50%;
          bottom: 4px;
          width: 48px;
          height: 20px;
          transform: translateX(-50%);
          border: 1px solid color-mix(in srgb, var(--team) 70%, white);
          border-radius: 50%;
          box-shadow: 0 0 12px color-mix(in srgb, var(--team) 38%, transparent);
          opacity: 0.72;
          animation: ba-lock 920ms ease-in-out infinite;
        }

        .ba-attack-ring {
          left: 47px;
          top: 25px;
          width: 30px;
          height: 30px;
          border: 2px solid rgba(246, 196, 90, 0.85);
          border-radius: 50%;
          animation: ba-impact 520ms ease-out infinite;
        }

        .ba-unit-bot .ba-attack-ring {
          left: 0;
        }

        .ba-hit-flash {
          inset: 6px 9px 10px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.72);
          mix-blend-mode: screen;
          animation: ba-hit 180ms ease-out forwards;
        }

        .ba-arena {
          width: min(100%, 620px);
          aspect-ratio: 959 / 1640;
          min-height: 0;
          margin-inline: auto;
          isolation: isolate;
          background: url("/battle-arena/arena-bg.png") center / 100% 100% no-repeat;
          box-shadow:
            0 24px 58px rgba(27, 14, 9, 0.22),
            inset 0 0 0 1px rgba(255, 224, 162, 0.38);
        }

        .ba-arena-selecting {
          cursor: crosshair;
        }

        .ba-structure {
          position: absolute;
          z-index: 17;
          transform: translate(-50%, -60%);
          pointer-events: none;
          filter: drop-shadow(0 11px 10px rgba(20, 9, 5, 0.26));
        }

        .ba-structure-mainCastle {
          z-index: 16;
          transform: translate(-50%, -60%);
        }

        .ba-structure-sideTower {
          z-index: 18;
          transform: translate(-50%, -61%);
        }

        .ba-structure-player {
          z-index: 18;
        }

        .ba-structure-asset {
          display: block;
          width: 100%;
          height: auto;
          user-select: none;
          -webkit-user-drag: none;
        }

        .ba-structure-destroyed .ba-structure-asset {
          opacity: 0.38;
          filter: grayscale(0.8) saturate(0.55) brightness(0.72);
        }

        .ba-structure-destroyed {
          z-index: 10;
        }

        .ba-structure .ba-base-health {
          position: absolute;
          left: 50%;
          bottom: 8%;
          width: 58%;
          margin: 0;
          transform: translateX(-50%);
          opacity: 0.95;
        }

        .ba-structure-mainCastle .ba-base-health {
          bottom: 10%;
          width: 46%;
        }

        .ba-structure-destroyed .ba-base-health {
          display: none;
        }

        .ba-structure .ba-base-health span {
          width: var(--hp);
        }

        .ba-arena::before,
        .ba-arena::after {
          display: none;
        }

        .ba-base {
          z-index: 18;
          width: 104px;
          transform: translate(-50%, -50%);
          filter: drop-shadow(0 8px 10px rgba(20, 9, 5, 0.24));
        }

        .ba-base-player {
          left: 50%;
          top: 86%;
          right: auto;
        }

        .ba-base-bot {
          left: 50%;
          top: 13%;
          right: auto;
        }

        .ba-defense-zone {
          display: none;
        }

        .ba-base-health {
          height: 8px;
          margin: 0 10px;
          border: 1px solid rgba(255, 225, 167, 0.72);
          background: rgba(34, 20, 14, 0.46);
          box-shadow:
            0 4px 8px rgba(20, 9, 5, 0.22),
            inset 0 0 0 1px rgba(36, 20, 15, 0.1);
        }

        .ba-base-hp {
          display: inline-flex;
          min-width: 34px;
          height: 18px;
          margin-top: 2px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(255, 225, 167, 0.62);
          background: rgba(35, 20, 15, 0.68);
          color: #fff3d3;
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
        }

        @keyframes ba-waiter-breathe {
          0%, 100% { translate: 0 0; }
          50% { translate: 0 -1px; }
        }

        @keyframes ba-waiter-footfall {
          0%, 100% { translate: 0 0; }
          50% { translate: 0 -2px; }
        }

        @keyframes ba-waiter-attack-snap {
          0%, 100% { translate: 0 0; }
          45% { translate: 5px -1px; }
        }

        @keyframes ba-waiter-hit {
          0% { filter: brightness(1.55); }
          100% { filter: brightness(1); }
        }

        @keyframes ba-waiter-die {
          0% { opacity: 1; translate: 0 0; }
          100% { opacity: 0.36; translate: 0 3px; }
        }

        @keyframes ba-coffee-projectile {
          0% { opacity: 0.95; transform: scale(0.72); }
          100% { opacity: 0; transform: scale(1.45); }
        }

        @keyframes ba-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        @keyframes ba-unit-walk {
          0%, 100% { translate: 0 0; }
          50% { translate: 0 -2px; }
        }

        @keyframes ba-unit-attack {
          0%, 100% { translate: 0 0; }
          45% { translate: 2px -1px; }
        }

        @keyframes ba-run {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-5px) rotate(2deg); }
        }

        @keyframes ba-shadow {
          0%, 100% { transform: scaleX(1); opacity: 0.22; }
          50% { transform: scaleX(0.78); opacity: 0.15; }
        }

        @keyframes ba-arm-swing {
          0%, 100% { transform: rotate(-12deg); }
          50% { transform: rotate(18deg); }
        }

        @keyframes ba-step {
          0%, 100% { transform: rotate(12deg) translateY(0); }
          50% { transform: rotate(-14deg) translateY(2px); }
        }

        @keyframes ba-strike {
          0%, 100% { transform: translateY(0) translateX(0); }
          45% { transform: translateY(-3px) translateX(6px); }
        }

        @keyframes ba-attack-arm {
          0%, 100% { transform: rotate(8deg); }
          50% { transform: rotate(-58deg) translateY(-2px); }
        }

        @keyframes ba-accessory-strike {
          0%, 100% { transform: rotate(0deg) translateX(0); }
          50% { transform: rotate(-18deg) translateX(7px); }
        }

        @keyframes ba-steam {
          0%, 100% { opacity: 0.2; transform: translateY(2px) scaleY(0.82); }
          50% { opacity: 0.8; transform: translateY(-3px) scaleY(1.18); }
        }

        @keyframes ba-bean-pop {
          0% { opacity: 0; transform: translate(0, 0) rotate(0deg); }
          40% { opacity: 1; }
          100% { opacity: 0; transform: translate(13px, -12px) rotate(220deg); }
        }

        @keyframes ba-impact {
          0% { transform: scale(0.25); opacity: 0.9; }
          100% { transform: scale(1.45); opacity: 0; }
        }

        @keyframes ba-impact-dot {
          0% { opacity: 0.95; transform: scale(0.42); }
          100% { opacity: 0; transform: scale(2.8); }
        }

        @keyframes ba-beam {
          0% { opacity: 0.88; stroke-dashoffset: 4; }
          100% { opacity: 0; stroke-dashoffset: 0; }
        }

        @keyframes ba-lock {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.58; }
          50% { transform: translateX(-50%) scale(1.08); opacity: 0.82; }
        }

        @keyframes ba-hit {
          0% { opacity: 0.95; transform: scale(0.84); }
          100% { opacity: 0; transform: scale(1.22); }
        }

        @keyframes ba-defeat {
          0% { opacity: 1; transform: translate(-50%, -100%) scale(var(--depth)); }
          100% { opacity: 0; transform: translate(-50%, -100%) scale(calc(var(--depth) * 0.58)); }
        }

        @keyframes ba-waiter-defeat {
          0% { opacity: 1; transform: translate(-50%, -100%) scale(var(--depth)); }
          100% { opacity: 0; transform: translate(-50%, -100%) scale(var(--depth)); }
        }

        @media (max-width: 640px) {
          .ba-game-shell {
            height: 100dvh;
            max-height: 100dvh;
            min-height: 0;
            width: 100vw;
            overflow: hidden;
            overscroll-behavior: none;
          }

          .ba-game-frame {
            height: 100dvh;
            max-height: 100dvh;
            min-height: 0;
            border: 0;
            border-radius: 0;
          }

          .ba-game-topbar {
            left: 8px;
            top: 9px;
          }

          .ba-game-topbar h2 {
            font-size: 10px;
          }

          .ba-game-topbar button {
            width: 32px;
            padding: 0;
            font-size: 0;
          }

          .ba-playfield {
            min-height: 0;
            flex: 1;
            flex-basis: 0;
            align-items: stretch;
          }

          .ba-arena {
            width: 100%;
            height: 100%;
            aspect-ratio: auto;
            border-radius: 0;
            box-shadow:
              inset 0 0 0 1px rgba(255, 224, 162, 0.28),
              inset 0 -18px 42px rgba(20, 9, 5, 0.2);
          }

          .ba-bottom-hud {
            padding: 5px max(7px, env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom)) max(7px, env(safe-area-inset-left));
          }

          .ba-card-slots {
            gap: 4px;
            margin-top: 5px;
          }

          .ba-card-button,
          .ba-card-future {
            min-height: 56px;
            padding: 5px 4px 4px;
          }

          .ba-card-avatar {
            height: 31px;
            width: 31px;
          }

          .ba-cost-badge {
            height: 19px;
            min-width: 19px;
            padding-inline: 5px;
            font-size: 10px;
          }

          .ba-card-name {
            font-size: 10px;
          }

          .ba-energy-row {
            grid-template-columns: 20px minmax(0, 1fr) auto;
            gap: 6px;
          }

          .ba-energy-icon {
            height: 20px;
            width: 20px;
            border-radius: 7px;
          }

          .ba-energy-icon svg {
            height: 13px;
            width: 13px;
          }

          .ba-energy-track {
            height: 7px;
          }

          .ba-energy-value {
            min-width: 42px;
            font-size: 11px;
          }

          .ba-notice {
            min-height: 16px;
            margin-top: 4px;
            font-size: 10px;
            line-height: 1.15;
          }

          .ba-base {
            width: 88px;
            transform: translate(-50%, -50%) scale(0.88);
          }

          .ba-base-player {
            left: 50%;
            top: 86%;
          }

          .ba-base-bot {
            left: 50%;
            top: 13%;
            right: auto;
          }

          .ba-unit {
            width: clamp(34px, 9vw, 50px);
            height: clamp(48px, 12vw, 66px);
          }

          .ba-character:not(.ba-character-mini) {
            transform: scale(0.8);
            transform-origin: center bottom;
          }

          .ba-hp-track {
            left: 12%;
            right: 12%;
            top: -6px;
            height: 4px;
          }
        }
      `}</style>
    </section>
  );
}
