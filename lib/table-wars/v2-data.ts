import { randomUUID } from "crypto";

import { cookies } from "next/headers";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import { getCustomerProfileForActiveSession, type CustomerProfileRow } from "@/lib/data/customers";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildUnitTravelTime,
  calculateAvailableLanes,
  canPlayerControlCell,
  chooseAiMove,
  determineWinningTeam,
  growCells,
  resolveArrivedUnits,
  resolveRoadBattles,
  type TableWarsV2CellUpdate,
  type TableWarsV2UnitUpdate,
} from "@/lib/table-wars/v2-engine";
import type {
  TableWarsRole,
  TableWarsTeam,
  TableWarsV2Cell,
  TableWarsV2CellTeam,
  TableWarsV2Event,
  TableWarsV2JoinResult,
  TableWarsV2LegendPreview,
  TableWarsV2Player,
  TableWarsV2Round,
  TableWarsV2RoundStatus,
  TableWarsV2Snapshot,
  TableWarsV2TeamCounts,
  TableWarsV2Unit,
  TableWarsV2UnitStatus,
} from "@/lib/table-wars/v2-types";

const TABLE_WARS_FEATURE_KEY = "in_store_table_wars";
const TABLE_WARS_V2_TOTAL_CELLS = 40;
const TABLE_WARS_V2_MAX_PLAYERS_PER_TEAM = 10;
const TABLE_WARS_V2_BASE_SOLDIERS = 25;
const TABLE_WARS_V2_DEFAULT_SOLDIERS = 10;
const TABLE_WARS_V2_MAX_SOLDIERS = 60;
const TABLE_WARS_V2_CONTROL_LIMIT = 5;
const TABLE_WARS_V2_EVENT_LIMIT = 12;
const TABLE_WARS_V2_MIN_SEND_SOLDIERS = 2;

type QueryClient = {
  from(table: string): any;
};

type PublicCafe = {
  id: string;
  slug: string;
  name: string;
};

type PlayabilityResult =
  | {
      cafe: PublicCafe;
      featureEnabled: true;
      gameEnabled: true;
    }
  | {
      cafe: PublicCafe | null;
      featureEnabled: boolean;
      gameEnabled: false;
    };

function tableWarsV2Db(client: ReturnType<typeof createAdminClient>) {
  return client as unknown as QueryClient;
}

function text(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const next = String(value).trim();
  return next || fallback;
}

function nullableText(value: unknown) {
  const next = text(value);
  return next || null;
}

function numberValue(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function intValue(value: unknown) {
  return Math.max(0, Math.trunc(numberValue(value)));
}

function boolValue(value: unknown) {
  return Boolean(value);
}

function normalizeTeam(value: unknown): TableWarsTeam {
  if (value === "blue" || value === "red") return value;
  throw new Error("فريق حرب الطاولات غير صالح.");
}

function oppositeTeam(team: TableWarsTeam): TableWarsTeam {
  return team === "blue" ? "red" : "blue";
}

function mapRound(row: Record<string, unknown>): TableWarsV2Round {
  return {
    id: text(row.id),
    cafeId: text(row.cafe_id),
    status: text(row.status, "waiting") as TableWarsV2RoundStatus,
    winningTeam: nullableText(row.winning_team) as TableWarsTeam | null,
    aiBlueEnabled: boolValue(row.ai_blue_enabled),
    aiRedEnabled: boolValue(row.ai_red_enabled),
    bluePlayerCount: intValue(row.blue_player_count),
    redPlayerCount: intValue(row.red_player_count),
    maxPlayersPerTeam: intValue(row.max_players_per_team) || TABLE_WARS_V2_MAX_PLAYERS_PER_TEAM,
    totalCells: intValue(row.total_cells) || TABLE_WARS_V2_TOTAL_CELLS,
    seed: nullableText(row.seed),
    startedAt: nullableText(row.started_at),
    endedAt: nullableText(row.ended_at),
    lastTickAt: nullableText(row.last_tick_at),
    createdAt: nullableText(row.created_at),
    updatedAt: nullableText(row.updated_at),
  };
}

function mapPlayer(row: Record<string, unknown>): TableWarsV2Player {
  return {
    id: text(row.id),
    cafeId: text(row.cafe_id),
    roundId: text(row.round_id),
    customerId: nullableText(row.customer_id),
    team: normalizeTeam(row.team),
    role: text(row.role, "player") as TableWarsRole,
    displayName: text(row.display_name, "لاعب"),
    baseCellId: nullableText(row.base_cell_id),
    isConnected: boolValue(row.is_connected),
    joinedAt: nullableText(row.joined_at),
    leftAt: nullableText(row.left_at),
    lastSeenAt: nullableText(row.last_seen_at),
    playSeconds: intValue(row.play_seconds),
    wonThisRound: boolValue(row.won_this_round),
  };
}

function mapCell(row: Record<string, unknown>): TableWarsV2Cell {
  return {
    id: text(row.id),
    cafeId: text(row.cafe_id),
    roundId: text(row.round_id),
    cellKey: text(row.cell_key),
    slotIndex: intValue(row.slot_index),
    x: numberValue(row.x),
    y: numberValue(row.y),
    team: text(row.team, "neutral") as TableWarsV2CellTeam,
    assignedPlayerId: nullableText(row.assigned_player_id),
    isBase: boolValue(row.is_base),
    soldiers: intValue(row.soldiers),
    maxSoldiers: intValue(row.max_soldiers) || TABLE_WARS_V2_MAX_SOLDIERS,
    updatedAt: nullableText(row.updated_at),
  };
}

function mapUnit(row: Record<string, unknown>): TableWarsV2Unit {
  return {
    id: text(row.id),
    cafeId: text(row.cafe_id),
    roundId: text(row.round_id),
    fromCellId: text(row.from_cell_id),
    toCellId: text(row.to_cell_id),
    team: normalizeTeam(row.team),
    ownerPlayerId: nullableText(row.owner_player_id),
    soldiers: intValue(row.soldiers),
    startedAt: nullableText(row.started_at),
    arrivesAt: nullableText(row.arrives_at),
    laneIndex: intValue(row.lane_index),
    status: text(row.status, "moving") as TableWarsV2UnitStatus,
  };
}

function mapLegend(row: Record<string, unknown>): TableWarsV2LegendPreview {
  return {
    customerId: text(row.customer_id),
    displayName: text(row.display_name, "لاعب"),
    team: normalizeTeam(row.team),
    playSeconds: intValue(row.play_seconds),
    wins: intValue(row.wins),
    lastWinAt: nullableText(row.last_win_at),
  };
}

function mapEvent(row: Record<string, unknown>): TableWarsV2Event {
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};

  return {
    id: text(row.id),
    cafeId: text(row.cafe_id),
    roundId: text(row.round_id),
    eventType: text(row.event_type),
    payload,
    createdAt: nullableText(row.created_at),
  };
}

function customerDisplayName(profile: CustomerProfileRow) {
  return text(profile.full_name) || text(profile.phone) || text(profile.email) || "لاعب";
}

function cellKey(slotIndex: number) {
  return `cell-${String(slotIndex).padStart(2, "0")}`;
}

function buildCellSeed(round: TableWarsV2Round) {
  return Array.from({ length: TABLE_WARS_V2_TOTAL_CELLS }, (_, index) => {
    const slotIndex = index + 1;
    const column = index % 8;
    const row = Math.floor(index / 8);
    const rowOffset = row % 2 === 0 ? 0 : 4;

    return {
      cafe_id: round.cafeId,
      round_id: round.id,
      cell_key: cellKey(slotIndex),
      slot_index: slotIndex,
      x: Math.min(92, 8 + column * 12 + rowOffset),
      y: 10 + row * 20,
      team: "neutral",
      is_base: false,
      soldiers: TABLE_WARS_V2_DEFAULT_SOLDIERS,
      max_soldiers: TABLE_WARS_V2_MAX_SOLDIERS,
    };
  });
}

function homeSlotsForTeam(team: TableWarsTeam) {
  if (team === "blue") return Array.from({ length: 10 }, (_, index) => index + 1);
  return Array.from({ length: 10 }, (_, index) => index + 31);
}

function emptyTeamCounts(): TableWarsV2TeamCounts {
  return {
    bluePlayers: 0,
    redPlayers: 0,
    blueAi: 0,
    redAi: 0,
    blueSpectators: 0,
    redSpectators: 0,
  };
}

function countPlayers(players: TableWarsV2Player[]): TableWarsV2TeamCounts {
  return players.reduce((counts, player) => {
    if (player.team === "blue" && player.role === "player") counts.bluePlayers += 1;
    if (player.team === "red" && player.role === "player") counts.redPlayers += 1;
    if (player.team === "blue" && player.role === "ai") counts.blueAi += 1;
    if (player.team === "red" && player.role === "ai") counts.redAi += 1;
    if (player.team === "blue" && player.role === "spectator") counts.blueSpectators += 1;
    if (player.team === "red" && player.role === "spectator") counts.redSpectators += 1;
    return counts;
  }, emptyTeamCounts());
}

function todayInRiyadh() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function assertNoDbError<T>(
  result: { data: T; error: { message?: string } | null },
  fallbackMessage: string,
) {
  if (result.error) throw new Error(result.error.message || fallbackMessage);
  return result.data;
}

async function getActiveTableWarsV2Round(cafeId: string): Promise<TableWarsV2Round | null> {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_rounds")
    .select("*")
    .eq("cafe_id", cafeId)
    .in("status", ["waiting", "active", "finished"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message || "تعذر جلب جولة حرب الطاولات.");
  return data ? mapRound(data as Record<string, unknown>) : null;
}

async function getActivePhysicalTableCount(cafeId: string) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { count, error } = await supabase
    .from("table_wars_tables")
    .select("id", { count: "exact", head: true })
    .eq("cafe_id", cafeId)
    .eq("is_active", true);

  if (error) throw new Error(error.message || "تعذر التحقق من تفعيل حرب الطاولات.");
  return Number(count ?? 0);
}

async function getPublicTableWarsV2Playability(slug: string): Promise<PlayabilityResult> {
  const cafe = await getPublicCafeBySlugAdmin(slug);
  if (!cafe) return { cafe: null, featureEnabled: false, gameEnabled: false };

  const publicCafe: PublicCafe = {
    id: String(cafe.id),
    slug: String(cafe.slug ?? slug),
    name: String(cafe.name),
  };
  const featureEnabled = await hasBrandFeature(publicCafe.id, TABLE_WARS_FEATURE_KEY);
  if (!featureEnabled) {
    return { cafe: publicCafe, featureEnabled: false, gameEnabled: false };
  }

  const tableCount = await getActivePhysicalTableCount(publicCafe.id);
  return {
    cafe: publicCafe,
    featureEnabled: true,
    gameEnabled: tableCount > 0,
  };
}

async function ensurePublicTableWarsV2Playable(slug: string) {
  const result = await getPublicTableWarsV2Playability(slug);
  if (!result.cafe) throw new Error("لم يتم العثور على الفرع.");
  if (!result.featureEnabled) throw new Error("ميزة حرب الطاولات غير مفعلة لهذا الفرع.");
  if (!result.gameEnabled) throw new Error("حرب الطاولات غير مفعلة لهذه العلامة.");
  return result.cafe;
}

export async function seedTableWarsV2RoundCells(round: TableWarsV2Round) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_cells")
    .select("slot_index")
    .eq("cafe_id", round.cafeId)
    .eq("round_id", round.id);

  if (error) throw new Error(error.message || "تعذر فحص خلايا جولة حرب الطاولات.");

  const existingSlots = new Set(
    (Array.isArray(data) ? data : []).map((row) => intValue((row as Record<string, unknown>).slot_index)),
  );
  const missingCells = buildCellSeed(round).filter((cell) => !existingSlots.has(cell.slot_index));
  if (missingCells.length === 0) return;

  const insertResult = await supabase.from("table_wars_v2_cells").insert(missingCells);
  if (insertResult.error) {
    throw new Error(insertResult.error.message || "تعذر إنشاء خلايا جولة حرب الطاولات.");
  }
}

export async function getOrCreateActiveTableWarsV2Round(cafeId: string): Promise<TableWarsV2Round> {
  const existing = await getActiveTableWarsV2Round(cafeId);
  if (existing) {
    await seedTableWarsV2RoundCells(existing);
    return existing;
  }

  const supabase = tableWarsV2Db(createAdminClient());
  const now = new Date().toISOString();
  const created = await assertNoDbError(
    await supabase
      .from("table_wars_v2_rounds")
      .insert({
        cafe_id: cafeId,
        status: "active",
        ai_blue_enabled: false,
        ai_red_enabled: false,
        blue_player_count: 0,
        red_player_count: 0,
        max_players_per_team: TABLE_WARS_V2_MAX_PLAYERS_PER_TEAM,
        total_cells: TABLE_WARS_V2_TOTAL_CELLS,
        seed: randomUUID(),
        started_at: now,
        last_tick_at: now,
      })
      .select("*")
      .single(),
    "تعذر إنشاء جولة حرب الطاولات.",
  );
  const round = mapRound(created as Record<string, unknown>);
  await seedTableWarsV2RoundCells(round);
  return round;
}

async function getRoundPlayers(round: TableWarsV2Round) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_players")
    .select("*")
    .eq("cafe_id", round.cafeId)
    .eq("round_id", round.id)
    .order("joined_at", { ascending: true });

  if (error) throw new Error(error.message || "تعذر جلب لاعبي حرب الطاولات.");
  return (Array.isArray(data) ? data : []).map((row) => mapPlayer(row as Record<string, unknown>));
}

async function getRoundCells(round: TableWarsV2Round) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_cells")
    .select("*")
    .eq("cafe_id", round.cafeId)
    .eq("round_id", round.id)
    .order("slot_index", { ascending: true });

  if (error) throw new Error(error.message || "تعذر جلب خلايا حرب الطاولات.");
  return (Array.isArray(data) ? data : [])
    .map((row) => mapCell(row as Record<string, unknown>))
    .filter((cell) => cell.slotIndex <= TABLE_WARS_V2_TOTAL_CELLS);
}

async function getRoundMovingUnits(round: TableWarsV2Round) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_units")
    .select("*")
    .eq("cafe_id", round.cafeId)
    .eq("round_id", round.id)
    .eq("status", "moving")
    .order("started_at", { ascending: true });

  if (error) throw new Error(error.message || "تعذر جلب وحدات حرب الطاولات.");
  return (Array.isArray(data) ? data : []).map((row) => mapUnit(row as Record<string, unknown>));
}

async function getRoundRecentEvents(round: TableWarsV2Round, limit = TABLE_WARS_V2_EVENT_LIMIT) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_events")
    .select("*")
    .eq("cafe_id", round.cafeId)
    .eq("round_id", round.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message || "Unable to load table wars events.");
  return (Array.isArray(data) ? data : []).map((row) => mapEvent(row as Record<string, unknown>));
}

async function getCafeByIdAdmin(cafeId: string): Promise<PublicCafe | null> {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("cafes")
    .select("id,slug,name,status")
    .eq("id", cafeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message || "Unable to load cafe.");
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const status = nullableText(row.status);
  if (status && !["active", "published"].includes(status)) return null;
  return {
    id: text(row.id),
    slug: text(row.slug),
    name: text(row.name),
  };
}

async function getLegendsPreview(cafeId: string) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_daily_player_stats")
    .select("customer_id,display_name,team,play_seconds,wins,last_win_at")
    .eq("cafe_id", cafeId)
    .eq("day", todayInRiyadh())
    .gt("wins", 0)
    .order("play_seconds", { ascending: false })
    .limit(8);

  if (error) throw new Error(error.message || "تعذر جلب أساطير حرب الطاولات.");
  return (Array.isArray(data) ? data : []).map((row) => mapLegend(row as Record<string, unknown>));
}

async function getCurrentPlayer(round: TableWarsV2Round, customerId: string) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_players")
    .select("*")
    .eq("cafe_id", round.cafeId)
    .eq("round_id", round.id)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message || "تعذر جلب حالة اللاعب.");
  return data ? mapPlayer(data as Record<string, unknown>) : null;
}

async function refreshRoundTeamCounts(round: TableWarsV2Round) {
  const supabase = tableWarsV2Db(createAdminClient());
  const players = await getRoundPlayers(round);
  const counts = countPlayers(players);
  const updated = await assertNoDbError(
    await supabase
      .from("table_wars_v2_rounds")
      .update({
        blue_player_count: counts.bluePlayers,
        red_player_count: counts.redPlayers,
        ai_blue_enabled: counts.blueAi > 0,
        ai_red_enabled: counts.redAi > 0,
      })
      .eq("id", round.id)
      .eq("cafe_id", round.cafeId)
      .select("*")
      .single(),
    "تعذر تحديث أعداد فرق حرب الطاولات.",
  );
  return {
    round: mapRound(updated as Record<string, unknown>),
    counts,
  };
}

async function candidateBaseCells(round: TableWarsV2Round, team: TableWarsTeam) {
  const cells = await getRoundCells(round);
  const teamSlots = new Set(homeSlotsForTeam(team));
  const available = cells.filter((cell) => !cell.assignedPlayerId);
  const bySlot = available.filter((cell) => teamSlots.has(cell.slotIndex) && (cell.team === team || cell.team === "neutral"));
  const byTeam = available.filter((cell) => cell.team === team && !teamSlots.has(cell.slotIndex));
  const byNeutral = available.filter((cell) => cell.team === "neutral" && !teamSlots.has(cell.slotIndex));
  return [...bySlot, ...byTeam, ...byNeutral];
}

async function assignBaseCell(round: TableWarsV2Round, team: TableWarsTeam, playerId: string) {
  const supabase = tableWarsV2Db(createAdminClient());
  const candidates = await candidateBaseCells(round, team);

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("table_wars_v2_cells")
      .update({
        team,
        assigned_player_id: playerId,
        is_base: true,
        soldiers: TABLE_WARS_V2_BASE_SOLDIERS,
      })
      .eq("id", candidate.id)
      .eq("cafe_id", round.cafeId)
      .eq("round_id", round.id)
      .is("assigned_player_id", null)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message || "تعذر تعيين قلعة اللاعب.");
    if (data) return mapCell(data as Record<string, unknown>);
  }

  return null;
}

async function updatePlayerBase(round: TableWarsV2Round, playerId: string, baseCellId: string | null) {
  const supabase = tableWarsV2Db(createAdminClient());
  const updated = await assertNoDbError(
    await supabase
      .from("table_wars_v2_players")
      .update({ base_cell_id: baseCellId })
      .eq("id", playerId)
      .eq("cafe_id", round.cafeId)
      .eq("round_id", round.id)
      .select("*")
      .single(),
    "تعذر تحديث قلعة اللاعب.",
  );
  return mapPlayer(updated as Record<string, unknown>);
}

async function createRoundPlayer(input: {
  round: TableWarsV2Round;
  customerId: string | null;
  team: TableWarsTeam;
  role: TableWarsRole;
  displayName: string;
}) {
  const supabase = tableWarsV2Db(createAdminClient());
  const created = await assertNoDbError(
    await supabase
      .from("table_wars_v2_players")
      .insert({
        cafe_id: input.round.cafeId,
        round_id: input.round.id,
        customer_id: input.customerId,
        team: input.team,
        role: input.role,
        display_name: input.displayName,
        is_connected: input.role !== "ai",
      })
      .select("*")
      .single(),
    "تعذر إنشاء لاعب حرب الطاولات.",
  );
  return mapPlayer(created as Record<string, unknown>);
}

async function convertPlayerToSpectator(round: TableWarsV2Round, player: TableWarsV2Player) {
  const supabase = tableWarsV2Db(createAdminClient());
  const updated = await assertNoDbError(
    await supabase
      .from("table_wars_v2_players")
      .update({ role: "spectator", base_cell_id: null })
      .eq("id", player.id)
      .eq("cafe_id", round.cafeId)
      .eq("round_id", round.id)
      .select("*")
      .single(),
    "تعذر تحويل اللاعب إلى متفرج.",
  );
  return mapPlayer(updated as Record<string, unknown>);
}

async function createPlayerWithBase(input: {
  round: TableWarsV2Round;
  customerId: string | null;
  team: TableWarsTeam;
  role: "player" | "ai";
  displayName: string;
}) {
  const player = await createRoundPlayer(input);
  const baseCell = await assignBaseCell(input.round, input.team, player.id);
  if (!baseCell) {
    if (input.role === "player") return convertPlayerToSpectator(input.round, player);
    return player;
  }
  return updatePlayerBase(input.round, player.id, baseCell.id);
}

async function ensureAiPlaceholder(round: TableWarsV2Round, team: TableWarsTeam) {
  const players = await getRoundPlayers(round);
  const existingAi = players.find((player) => player.team === team && player.role === "ai");
  if (existingAi) return existingAi;

  return createPlayerWithBase({
    round,
    customerId: null,
    team,
    role: "ai",
    displayName: "الكمبيوتر",
  });
}

async function maybeCreateAiPlaceholder(round: TableWarsV2Round, joinedTeam: TableWarsTeam) {
  const players = await getRoundPlayers(round);
  const counts = countPlayers(players);
  const humanPlayerCount = counts.bluePlayers + counts.redPlayers;
  const enemyTeam = oppositeTeam(joinedTeam);
  const enemyHumanCount = enemyTeam === "blue" ? counts.bluePlayers : counts.redPlayers;
  const enemyAiCount = enemyTeam === "blue" ? counts.blueAi : counts.redAi;

  if (humanPlayerCount === 1 && enemyHumanCount === 0 && enemyAiCount === 0) {
    await ensureAiPlaceholder(round, enemyTeam);
  }
}

function controlledCellIdsForPlayer(player: TableWarsV2Player | null, cells: TableWarsV2Cell[]) {
  if (!player || (player.role !== "player" && player.role !== "ai")) return [];

  const ids = new Set<string>();
  const baseCell = cells.find((cell) => cell.assignedPlayerId === player.id || cell.id === player.baseCellId);
  if (baseCell) ids.add(baseCell.id);

  cells
    .filter((cell) => cell.team === player.team && !cell.assignedPlayerId)
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .slice(0, TABLE_WARS_V2_CONTROL_LIMIT)
    .forEach((cell) => ids.add(cell.id));

  return [...ids];
}

function messagesFromEvents(events: TableWarsV2Event[]) {
  const messages: string[] = [];

  for (const event of events) {
    if (event.eventType === "road_battle") messages.push("road_battle");
    if (event.eventType === "ai_move") messages.push("ai_move");
    if (event.eventType === "send_units") messages.push("send_units");
    if (event.eventType === "arrival") messages.push("arrival");
    if (event.eventType === "round_finished") messages.push("round_finished");
  }

  return messages;
}

function winnerMessage(team: TableWarsTeam | null) {
  if (team === "blue") return "فاز الفريق الأزرق";
  if (team === "red") return "فاز الفريق الأحمر";
  return null;
}

export async function getTableWarsV2SnapshotForCustomer(slug: string): Promise<TableWarsV2Snapshot> {
  const playability = await getPublicTableWarsV2Playability(slug);
  const cafe = playability.cafe;
  const fallbackCounts = emptyTeamCounts();

  if (!cafe || !playability.featureEnabled || !playability.gameEnabled) {
    return {
      cafeId: cafe?.id ?? "",
      cafeSlug: cafe?.slug ?? slug,
      featureEnabled: Boolean(playability.featureEnabled),
      gameEnabled: false,
      round: null,
      roundEnded: false,
      winnerMessage: null,
      currentPlayer: null,
      role: null,
      team: null,
      controlledCellIds: [],
      teamCounts: fallbackCounts,
      cells: [],
      units: [],
      legendsPreview: cafe ? await getLegendsPreview(cafe.id) : [],
      events: [],
      messages: [],
      isSpectator: false,
      canJoinBlue: false,
      canJoinRed: false,
    };
  }

  const [round, customer] = await Promise.all([
    getOrCreateActiveTableWarsV2Round(cafe.id),
    getCustomerProfileForActiveSession(cafe.slug),
  ]);
  const [players, cells, units, legendsPreview, events] = await Promise.all([
    getRoundPlayers(round),
    getRoundCells(round),
    getRoundMovingUnits(round),
    getLegendsPreview(cafe.id),
    getRoundRecentEvents(round),
  ]);
  const teamCounts = countPlayers(players);
  const currentPlayer = customer
    ? players.find((player) => player.customerId === String(customer.id)) ?? null
    : null;
  const controlledCellIds = controlledCellIdsForPlayer(currentPlayer, cells);

  return {
    cafeId: cafe.id,
    cafeSlug: cafe.slug,
    featureEnabled: true,
    gameEnabled: true,
    round,
    roundEnded: round.status === "finished",
    winnerMessage: winnerMessage(round.winningTeam),
    currentPlayer,
    role: currentPlayer?.role ?? null,
    team: currentPlayer?.team ?? null,
    controlledCellIds,
    teamCounts,
    cells,
    units,
    legendsPreview,
    events,
    messages: messagesFromEvents(events),
    isSpectator: currentPlayer?.role === "spectator",
    canJoinBlue: round.status !== "finished" && teamCounts.bluePlayers < round.maxPlayersPerTeam,
    canJoinRed: round.status !== "finished" && teamCounts.redPlayers < round.maxPlayersPerTeam,
  };
}

export async function joinTableWarsV2Customer(slug: string, requestedTeam: TableWarsTeam): Promise<TableWarsV2JoinResult> {
  const team = normalizeTeam(requestedTeam);
  const cafe = await ensurePublicTableWarsV2Playable(slug);
  const customer = await getCustomerProfileForActiveSession(cafe.slug);
  if (!customer) throw new Error("يجب تسجيل الدخول قبل دخول حرب الطاولات.");

  let round = await getOrCreateActiveTableWarsV2Round(cafe.id);
  const existingPlayer = await getCurrentPlayer(round, String(customer.id));
  if (existingPlayer) {
    const snapshot = await getTableWarsV2SnapshotForCustomer(cafe.slug);
    return {
      ok: true,
      status: "existing",
      team: existingPlayer.team,
      role: existingPlayer.role,
      player: existingPlayer,
      snapshot,
    };
  }
  if (round.status === "finished") {
    throw new Error("This table wars round has already finished.");
  }

  const { counts } = await refreshRoundTeamCounts(round);
  const teamPlayerCount = team === "blue" ? counts.bluePlayers : counts.redPlayers;
  const role: TableWarsRole = teamPlayerCount < round.maxPlayersPerTeam ? "player" : "spectator";
  const displayName = customerDisplayName(customer);

  let player =
    role === "player"
      ? await createPlayerWithBase({
          round,
          customerId: String(customer.id),
          team,
          role: "player",
          displayName,
        })
      : await createRoundPlayer({
          round,
          customerId: String(customer.id),
          team,
          role: "spectator",
          displayName,
        });

  if (player.role === "player") {
    await maybeCreateAiPlaceholder(round, team);
  }

  const refreshed = await refreshRoundTeamCounts(round);
  round = refreshed.round;
  player = (await getCurrentPlayer(round, String(customer.id))) ?? player;
  const snapshot = await getTableWarsV2SnapshotForCustomer(cafe.slug);

  return {
    ok: true,
    status: player.role === "spectator" ? "spectator" : "joined",
    team: player.team,
    role: player.role,
    player,
    snapshot,
  };
}

export async function sendTableWarsV2UnitsForCustomer(input: {
  fromCellId: string;
  toCellId: string;
  soldiers?: number;
  percentage?: number;
}) {
  const fromCellId = text(input.fromCellId);
  const toCellId = text(input.toCellId);
  if (!fromCellId || !toCellId) throw new Error("Missing cell id.");
  if (fromCellId === toCellId) throw new Error("Source and target cells must be different.");

  const [fromCell, toCell] = await Promise.all([
    getCellById(fromCellId),
    getCellById(toCellId),
  ]);
  if (!fromCell || !toCell) throw new Error("Cell not found.");
  if (
    fromCell.slotIndex > TABLE_WARS_V2_TOTAL_CELLS ||
    toCell.slotIndex > TABLE_WARS_V2_TOTAL_CELLS
  ) {
    throw new Error("Cell is outside the active table wars map.");
  }
  if (fromCell.cafeId !== toCell.cafeId || fromCell.roundId !== toCell.roundId) {
    throw new Error("Cells are not in the same round.");
  }

  const [round, cafe] = await Promise.all([
    getRoundById(fromCell.roundId, fromCell.cafeId),
    getCafeByIdAdmin(fromCell.cafeId),
  ]);
  if (!round || (round.status !== "active" && round.status !== "waiting")) {
    throw new Error("No active table wars round.");
  }
  if (!cafe) throw new Error("Cafe not found.");
  await ensurePublicTableWarsV2Playable(cafe.slug);

  const customer = await getCustomerProfileForActiveSession(cafe.slug);
  if (!customer) throw new Error("Unauthorized.");

  const currentPlayer = await getCurrentPlayer(round, String(customer.id));
  if (!currentPlayer || currentPlayer.role !== "player") throw new Error("Only players can send units.");

  const [cells, movingUnits] = await Promise.all([
    getRoundCells(round),
    getRoundMovingUnits(round),
  ]);
  const freshFromCell = cells.find((cell) => cell.id === fromCell.id) ?? fromCell;
  const freshToCell = cells.find((cell) => cell.id === toCell.id) ?? toCell;
  const controlledCellIds = controlledCellIdsForPlayer(currentPlayer, cells);
  const otherControlledUnassignedCount = cells.filter(
    (cell) => cell.id !== freshFromCell.id && cell.team === currentPlayer.team && !cell.assignedPlayerId,
  ).length;
  const canControl =
    controlledCellIds.includes(freshFromCell.id) ||
    canPlayerControlCell(currentPlayer, freshFromCell, otherControlledUnassignedCount);

  if (!canControl) throw new Error("Forbidden cell control.");
  if (freshFromCell.team !== currentPlayer.team) throw new Error("Source cell is not owned by your team.");

  const soldiers = resolveSendSoldiers(input, freshFromCell.soldiers);
  if (soldiers < TABLE_WARS_V2_MIN_SEND_SOLDIERS) throw new Error("Not enough soldiers to send.");

  const laneCount = calculateAvailableLanes(freshFromCell.soldiers);
  const laneIndex = firstAvailableLane(movingUnits, freshFromCell.id, laneCount);
  if (laneIndex === null) throw new Error("All outgoing lanes are busy.");

  const now = new Date();
  const travelMs = buildUnitTravelTime(freshFromCell, freshToCell);
  const arrivesAt = new Date(now.getTime() + travelMs);
  const supabase = tableWarsV2Db(createAdminClient());

  const updatedCell = await assertNoDbError(
    await supabase
      .from("table_wars_v2_cells")
      .update({ soldiers: freshFromCell.soldiers - soldiers })
      .eq("id", freshFromCell.id)
      .eq("cafe_id", round.cafeId)
      .eq("round_id", round.id)
      .gte("soldiers", soldiers)
      .select("*")
      .single(),
    "Unable to update source cell.",
  );

  const sourceAfterSend = mapCell(updatedCell as Record<string, unknown>);
  const createdUnit = await assertNoDbError(
    await supabase
      .from("table_wars_v2_units")
      .insert({
        cafe_id: round.cafeId,
        round_id: round.id,
        from_cell_id: sourceAfterSend.id,
        to_cell_id: freshToCell.id,
        team: currentPlayer.team,
        owner_player_id: currentPlayer.id,
        soldiers,
        started_at: now.toISOString(),
        arrives_at: arrivesAt.toISOString(),
        lane_index: laneIndex,
        status: "moving",
      })
      .select("*")
      .single(),
    "Unable to send units.",
  );

  const unit = mapUnit(createdUnit as Record<string, unknown>);
  await insertRoundEvents(round, [
    {
      eventType: "send_units",
      payload: {
        playerId: currentPlayer.id,
        team: currentPlayer.team,
        fromCellId: sourceAfterSend.id,
        toCellId: freshToCell.id,
        soldiers,
        laneIndex,
        unitId: unit.id,
      },
    },
  ]);

  return {
    ok: true as const,
    unit,
    snapshot: await getTableWarsV2SnapshotForCustomer(cafe.slug),
  };
}

export async function tickTableWarsV2ForActiveSession() {
  const slug = await getTableWarsV2SessionSlugFromCookies();
  if (!slug) throw new Error("Unauthorized.");

  const cafe = await ensurePublicTableWarsV2Playable(slug);
  const customer = await getCustomerProfileForActiveSession(cafe.slug);
  if (!customer) throw new Error("Unauthorized.");

  const round = await getOrCreateActiveTableWarsV2Round(cafe.id);
  if (round.status === "active" || round.status === "waiting") {
    await tickTableWarsV2Round(round);
  }

  return getTableWarsV2SnapshotForCustomer(cafe.slug);
}

async function getCellById(cellId: string) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_cells")
    .select("*")
    .eq("id", cellId)
    .maybeSingle();

  if (error) throw new Error(error.message || "Unable to load cell.");
  return data ? mapCell(data as Record<string, unknown>) : null;
}

async function getRoundById(roundId: string, cafeId: string) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { data, error } = await supabase
    .from("table_wars_v2_rounds")
    .select("*")
    .eq("id", roundId)
    .eq("cafe_id", cafeId)
    .maybeSingle();

  if (error) throw new Error(error.message || "Unable to load round.");
  return data ? mapRound(data as Record<string, unknown>) : null;
}

function resolveSendSoldiers(
  input: { soldiers?: number; percentage?: number },
  availableSoldiers: number,
) {
  const maxSend = Math.floor(availableSoldiers / 2);
  if (maxSend < TABLE_WARS_V2_MIN_SEND_SOLDIERS) return 0;

  if (input.soldiers !== undefined) {
    const soldiers = Math.trunc(Number(input.soldiers));
    if (!Number.isFinite(soldiers) || soldiers < TABLE_WARS_V2_MIN_SEND_SOLDIERS) return 0;
    if (soldiers > maxSend) throw new Error("Cannot send more than half of the soldiers.");
    return soldiers;
  }

  if (input.percentage !== undefined) {
    const percentage = Number(input.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 50) {
      throw new Error("Invalid send percentage.");
    }
    return Math.min(maxSend, Math.floor((availableSoldiers * percentage) / 100));
  }

  return maxSend;
}

function firstAvailableLane(units: TableWarsV2Unit[], fromCellId: string, laneCount: number) {
  const usedLaneIndexes = new Set(
    units
      .filter((unit) => unit.status === "moving" && unit.fromCellId === fromCellId)
      .map((unit) => unit.laneIndex),
  );

  for (let index = 0; index < laneCount; index += 1) {
    if (!usedLaneIndexes.has(index)) return index;
  }

  return null;
}

async function tickTableWarsV2Round(round: TableWarsV2Round) {
  const now = new Date();
  const [cells, units, players, recentEvents] = await Promise.all([
    getRoundCells(round),
    getRoundMovingUnits(round),
    getRoundPlayers(round),
    getRoundRecentEvents(round, 30),
  ]);

  const growth = growCells(cells, round.lastTickAt, now);
  await applyCellUpdates(round, growth.changedCells);

  let updatedRound = round;
  if (growth.didGrow) {
    updatedRound = await updateRoundLastTickAt(round, now);
  }

  const roadBattles = resolveRoadBattles(units, now);
  await applyUnitUpdates(round, roadBattles.changedUnits);
  await insertRoundEvents(round, roadBattles.events);

  const arrivals = resolveArrivedUnits(growth.cells, roadBattles.units, now);
  await Promise.all([
    applyCellUpdates(round, arrivals.changedCells),
    applyUnitUpdates(round, arrivals.changedUnits),
    insertRoundEvents(round, arrivals.events),
  ]);

  const winningTeam = determineWinningTeam(arrivals.cells);
  if (winningTeam) {
    updatedRound = await finishTableWarsV2Round(round, players, winningTeam, now);
    return updatedRound;
  }

  const aiMove = chooseAiMove({
    cells: arrivals.cells,
    units: arrivals.units.filter((unit) => unit.status === "moving"),
    players,
    now,
    lastAiMoveAtByTeam: lastAiMoveAtByTeam(recentEvents),
  });

  if (aiMove) {
    await applyAiMove(round, aiMove, arrivals.cells, now);
  }

  return updatedRound;
}

async function finishTableWarsV2Round(
  round: TableWarsV2Round,
  players: TableWarsV2Player[],
  winningTeam: TableWarsTeam,
  now: Date,
) {
  const supabase = tableWarsV2Db(createAdminClient());
  const finished = await assertNoDbError(
    await supabase
      .from("table_wars_v2_rounds")
      .update({
        status: "finished",
        winning_team: winningTeam,
        ended_at: now.toISOString(),
      })
      .eq("id", round.id)
      .eq("cafe_id", round.cafeId)
      .in("status", ["waiting", "active"])
      .select("*")
      .single(),
    "Unable to finish table wars round.",
  );
  const finishedRound = mapRound(finished as Record<string, unknown>);

  await Promise.all([
    markWinningPlayers(finishedRound, winningTeam),
    updateDailyPlayerStatsForRound(finishedRound, players, winningTeam, now),
    insertRoundEvents(finishedRound, [
      {
        eventType: "round_finished",
        payload: { winningTeam },
      },
    ]),
  ]);

  return finishedRound;
}

async function updateRoundLastTickAt(round: TableWarsV2Round, now: Date) {
  const supabase = tableWarsV2Db(createAdminClient());
  const updated = await assertNoDbError(
    await supabase
      .from("table_wars_v2_rounds")
      .update({ last_tick_at: now.toISOString() })
      .eq("id", round.id)
      .eq("cafe_id", round.cafeId)
      .select("*")
      .single(),
    "Unable to update round tick.",
  );
  return mapRound(updated as Record<string, unknown>);
}

async function markWinningPlayers(round: TableWarsV2Round, winningTeam: TableWarsTeam) {
  const supabase = tableWarsV2Db(createAdminClient());
  const { error } = await supabase
    .from("table_wars_v2_players")
    .update({ won_this_round: true })
    .eq("cafe_id", round.cafeId)
    .eq("round_id", round.id)
    .eq("team", winningTeam)
    .eq("role", "player")
    .not("customer_id", "is", null);

  if (error) throw new Error(error.message || "Unable to update winning table wars players.");
}

async function updateDailyPlayerStatsForRound(
  round: TableWarsV2Round,
  players: TableWarsV2Player[],
  winningTeam: TableWarsTeam,
  now: Date,
) {
  const realPlayers = players.filter((player) => player.role === "player" && player.customerId);
  if (realPlayers.length === 0) return;

  const supabase = tableWarsV2Db(createAdminClient());
  const customerIds = realPlayers.map((player) => player.customerId).filter((id): id is string => Boolean(id));
  const { data, error } = await supabase
    .from("table_wars_v2_daily_player_stats")
    .select("customer_id,play_seconds,wins,last_win_at")
    .eq("cafe_id", round.cafeId)
    .eq("day", todayInRiyadh())
    .in("customer_id", customerIds);

  if (error) throw new Error(error.message || "Unable to load table wars daily stats.");

  const existingByCustomer = new Map(
    (Array.isArray(data) ? data : []).map((row) => {
      const item = row as Record<string, unknown>;
      return [
        text(item.customer_id),
        {
          playSeconds: intValue(item.play_seconds),
          wins: intValue(item.wins),
          lastWinAt: nullableText(item.last_win_at),
        },
      ] as const;
    }),
  );

  const rows = realPlayers.map((player) => {
    const customerId = player.customerId as string;
    const existing = existingByCustomer.get(customerId);
    const playedSeconds = estimatePlayerRoundSeconds(round, player, now);
    const isWinner = player.team === winningTeam;

    return {
      cafe_id: round.cafeId,
      day: todayInRiyadh(),
      customer_id: customerId,
      display_name: player.displayName,
      team: player.team,
      play_seconds: (existing?.playSeconds ?? 0) + playedSeconds,
      wins: (existing?.wins ?? 0) + (isWinner ? 1 : 0),
      last_win_at: isWinner ? now.toISOString() : existing?.lastWinAt ?? null,
    };
  });

  const { error: upsertError } = await supabase
    .from("table_wars_v2_daily_player_stats")
    .upsert(rows, { onConflict: "cafe_id,day,customer_id" });

  if (upsertError) throw new Error(upsertError.message || "Unable to update table wars daily stats.");
}

function estimatePlayerRoundSeconds(round: TableWarsV2Round, player: TableWarsV2Player, now: Date) {
  const joinedAt = player.joinedAt ? Date.parse(player.joinedAt) : NaN;
  const startedAt = round.startedAt ? Date.parse(round.startedAt) : NaN;
  const startTime = Number.isFinite(joinedAt) ? joinedAt : startedAt;
  if (!Number.isFinite(startTime)) return Math.max(1, player.playSeconds);
  return Math.max(1, Math.floor((now.getTime() - startTime) / 1000));
}

async function applyCellUpdates(round: TableWarsV2Round, updates: TableWarsV2CellUpdate[]) {
  if (updates.length === 0) return;
  const supabase = tableWarsV2Db(createAdminClient());
  await Promise.all(
    updates.map(async (cell) => {
      const { error } = await supabase
        .from("table_wars_v2_cells")
        .update({
          team: cell.team,
          assigned_player_id: cell.assignedPlayerId,
          soldiers: cell.soldiers,
        })
        .eq("id", cell.id)
        .eq("cafe_id", round.cafeId)
        .eq("round_id", round.id);

      if (error) throw new Error(error.message || "Unable to update cell.");
    }),
  );
}

async function applyUnitUpdates(round: TableWarsV2Round, updates: TableWarsV2UnitUpdate[]) {
  if (updates.length === 0) return;
  const supabase = tableWarsV2Db(createAdminClient());
  await Promise.all(
    updates.map(async (unit) => {
      const { error } = await supabase
        .from("table_wars_v2_units")
        .update({
          soldiers: unit.soldiers,
          status: unit.status,
        })
        .eq("id", unit.id)
        .eq("cafe_id", round.cafeId)
        .eq("round_id", round.id);

      if (error) throw new Error(error.message || "Unable to update unit.");
    }),
  );
}

async function insertRoundEvents(
  round: TableWarsV2Round,
  events: Array<{ eventType: string; payload: Record<string, unknown> }>,
) {
  if (events.length === 0) return;
  const supabase = tableWarsV2Db(createAdminClient());
  const { error } = await supabase.from("table_wars_v2_events").insert(
    events.map((event) => ({
      cafe_id: round.cafeId,
      round_id: round.id,
      event_type: event.eventType,
      payload: event.payload,
    })),
  );

  if (error) throw new Error(error.message || "Unable to record table wars event.");
}

function lastAiMoveAtByTeam(events: TableWarsV2Event[]) {
  const result: Partial<Record<TableWarsTeam, string | null>> = {};

  for (const event of events) {
    if (event.eventType !== "ai_move") continue;
    const team = event.payload.team;
    if ((team === "blue" || team === "red") && !result[team]) {
      result[team] = event.createdAt;
    }
  }

  return result;
}

async function applyAiMove(
  round: TableWarsV2Round,
  aiMove: NonNullable<ReturnType<typeof chooseAiMove>>,
  cells: TableWarsV2Cell[],
  now: Date,
) {
  const source = cells.find((cell) => cell.id === aiMove.fromCellId);
  const target = cells.find((cell) => cell.id === aiMove.toCellId);
  if (!source || !target || source.soldiers < aiMove.soldiers) return;

  const supabase = tableWarsV2Db(createAdminClient());
  const arrivesAt = new Date(now.getTime() + aiMove.travelMs);
  const updatedSource = await assertNoDbError(
    await supabase
      .from("table_wars_v2_cells")
      .update({ soldiers: source.soldiers - aiMove.soldiers })
      .eq("id", source.id)
      .eq("cafe_id", round.cafeId)
      .eq("round_id", round.id)
      .gte("soldiers", aiMove.soldiers)
      .select("*")
      .single(),
    "Unable to update AI source cell.",
  );
  const sourceAfterSend = mapCell(updatedSource as Record<string, unknown>);

  const createdUnit = await assertNoDbError(
    await supabase
      .from("table_wars_v2_units")
      .insert({
        cafe_id: round.cafeId,
        round_id: round.id,
        from_cell_id: sourceAfterSend.id,
        to_cell_id: target.id,
        team: aiMove.team,
        owner_player_id: aiMove.playerId,
        soldiers: aiMove.soldiers,
        started_at: now.toISOString(),
        arrives_at: arrivesAt.toISOString(),
        lane_index: aiMove.laneIndex,
        status: "moving",
      })
      .select("*")
      .single(),
    "Unable to create AI unit.",
  );
  const unit = mapUnit(createdUnit as Record<string, unknown>);

  await insertRoundEvents(round, [
    {
      eventType: "ai_move",
      payload: {
        team: aiMove.team,
        playerId: aiMove.playerId,
        fromCellId: sourceAfterSend.id,
        toCellId: target.id,
        soldiers: aiMove.soldiers,
        laneIndex: aiMove.laneIndex,
        unitId: unit.id,
      },
    },
  ]);
}

async function getTableWarsV2SessionSlugFromCookies() {
  const cookieStore = await cookies();
  const prefix = "barndaksa_customer_session_";
  const sessionCookie = cookieStore.getAll().find((cookie) => cookie.name.startsWith(prefix));
  return sessionCookie ? sessionCookie.name.slice(prefix.length) : null;
}
