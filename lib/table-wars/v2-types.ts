export type TableWarsTeam = "blue" | "red";

export type TableWarsRole = "player" | "spectator" | "ai";

export type TableWarsV2RoundStatus = "waiting" | "active" | "finished" | "cancelled";

export type TableWarsV2CellTeam = TableWarsTeam | "neutral";

export type TableWarsV2UnitStatus = "moving" | "resolved" | "cancelled";

export type TableWarsV2Round = {
  id: string;
  cafeId: string;
  status: TableWarsV2RoundStatus;
  winningTeam: TableWarsTeam | null;
  aiBlueEnabled: boolean;
  aiRedEnabled: boolean;
  bluePlayerCount: number;
  redPlayerCount: number;
  maxPlayersPerTeam: number;
  totalCells: number;
  seed: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastTickAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TableWarsV2Player = {
  id: string;
  cafeId: string;
  roundId: string;
  customerId: string | null;
  team: TableWarsTeam;
  role: TableWarsRole;
  displayName: string;
  baseCellId: string | null;
  isConnected: boolean;
  joinedAt: string | null;
  leftAt: string | null;
  lastSeenAt: string | null;
  playSeconds: number;
  wonThisRound: boolean;
};

export type TableWarsV2Cell = {
  id: string;
  cafeId: string;
  roundId: string;
  cellKey: string;
  slotIndex: number;
  x: number;
  y: number;
  team: TableWarsV2CellTeam;
  assignedPlayerId: string | null;
  isBase: boolean;
  soldiers: number;
  maxSoldiers: number;
  updatedAt: string | null;
};

export type TableWarsV2Unit = {
  id: string;
  cafeId: string;
  roundId: string;
  fromCellId: string;
  toCellId: string;
  team: TableWarsTeam;
  ownerPlayerId: string | null;
  soldiers: number;
  startedAt: string | null;
  arrivesAt: string | null;
  laneIndex: number;
  status: TableWarsV2UnitStatus;
};

export type TableWarsV2LegendPreview = {
  customerId: string;
  displayName: string;
  team: TableWarsTeam;
  playSeconds: number;
  wins: number;
  lastWinAt: string | null;
};

export type TableWarsV2Event = {
  id: string;
  cafeId: string;
  roundId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string | null;
};

export type TableWarsV2TeamCounts = {
  bluePlayers: number;
  redPlayers: number;
  blueAi: number;
  redAi: number;
  blueSpectators: number;
  redSpectators: number;
};

export type TableWarsV2Snapshot = {
  cafeId: string;
  cafeSlug: string;
  featureEnabled: boolean;
  gameEnabled: boolean;
  round: TableWarsV2Round | null;
  roundEnded: boolean;
  winnerMessage: string | null;
  currentPlayer: TableWarsV2Player | null;
  players: TableWarsV2Player[];
  role: TableWarsRole | null;
  team: TableWarsTeam | null;
  controlledCellIds: string[];
  teamCounts: TableWarsV2TeamCounts;
  cells: TableWarsV2Cell[];
  units: TableWarsV2Unit[];
  legendsPreview: TableWarsV2LegendPreview[];
  events: TableWarsV2Event[];
  messages: string[];
  isSpectator: boolean;
  canJoinBlue: boolean;
  canJoinRed: boolean;
};

export type TableWarsV2JoinResult = {
  ok: true;
  status: "joined" | "spectator" | "existing";
  team: TableWarsTeam;
  role: TableWarsRole;
  player: TableWarsV2Player;
  snapshot: TableWarsV2Snapshot;
};
