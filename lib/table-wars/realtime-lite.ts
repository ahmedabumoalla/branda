"use client";

import { createClient } from "@/lib/supabase/client";
import type { TableWarsTeam, TableWarsV2CellTeam } from "@/lib/table-wars/v2-types";

export type TableWarsRealtimeLiteMoveEvent = {
  type: "player_move" | "ai_move";
  eventId: string;
  fromCellId: string;
  toCellId: string;
  team: TableWarsTeam;
  soldiers: number;
  startedAt: string;
  travelMs: number;
};

export type TableWarsRealtimeLiteBattleEvent = {
  type: "battle";
  eventId: string;
  fromCellId: string;
  toCellId: string;
  occurredAt: string;
};

export type TableWarsRealtimeLiteCaptureEvent = {
  type: "capture";
  eventId: string;
  cellId: string;
  team: TableWarsV2CellTeam;
  soldiers: number;
  occurredAt: string;
};

export type TableWarsRealtimeLiteRoundFinishedEvent = {
  type: "round_finished";
  eventId: string;
  winningTeam: TableWarsTeam;
  occurredAt: string;
};

export type TableWarsRealtimeLiteRoundResetEvent = {
  type: "round_reset";
  eventId: string;
  resetAt: string;
};

export type TableWarsRealtimeLiteEvent =
  | TableWarsRealtimeLiteMoveEvent
  | TableWarsRealtimeLiteBattleEvent
  | TableWarsRealtimeLiteCaptureEvent
  | TableWarsRealtimeLiteRoundFinishedEvent
  | TableWarsRealtimeLiteRoundResetEvent;

type RealtimeLiteInput = {
  roundId: string | null;
  cafeSlug: string;
  onEvent: (event: TableWarsRealtimeLiteEvent) => void;
  onStatus?: (status: "ready" | "closed" | "error") => void;
};

function safeChannelPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

export function tableWarsRealtimeLiteChannelName(roundId: string | null, cafeSlug: string) {
  const stableId = roundId ? safeChannelPart(roundId) : safeChannelPart(cafeSlug);
  return `table-wars-lite:${stableId}`;
}

export function createTableWarsRealtimeLiteChannel({
  roundId,
  cafeSlug,
  onEvent,
  onStatus,
}: RealtimeLiteInput) {
  const supabase = createClient();
  const channel = supabase.channel(tableWarsRealtimeLiteChannelName(roundId, cafeSlug), {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "table_wars_lite" }, ({ payload }) => {
    if (isTableWarsRealtimeLiteEvent(payload)) {
      onEvent(payload);
    }
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      onStatus?.("ready");
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      onStatus?.("error");
    } else if (status === "CLOSED") {
      onStatus?.("closed");
    }
  });

  return {
    send(event: TableWarsRealtimeLiteEvent) {
      return channel.send({
        type: "broadcast",
        event: "table_wars_lite",
        payload: event,
      });
    },
    close() {
      void supabase.removeChannel(channel);
    },
  };
}

function isTableWarsRealtimeLiteEvent(value: unknown): value is TableWarsRealtimeLiteEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TableWarsRealtimeLiteEvent>;
  if (typeof event.eventId !== "string") return false;
  if (event.type === "player_move" || event.type === "ai_move") {
    return (
      typeof event.fromCellId === "string" &&
      typeof event.toCellId === "string" &&
      (event.team === "blue" || event.team === "red") &&
      typeof event.soldiers === "number" &&
      typeof event.startedAt === "string" &&
      typeof event.travelMs === "number"
    );
  }
  if (event.type === "battle") {
    return (
      typeof event.fromCellId === "string" &&
      typeof event.toCellId === "string" &&
      typeof event.occurredAt === "string"
    );
  }
  if (event.type === "capture") {
    return (
      typeof event.cellId === "string" &&
      (event.team === "blue" || event.team === "red" || event.team === "neutral") &&
      typeof event.soldiers === "number" &&
      typeof event.occurredAt === "string"
    );
  }
  if (event.type === "round_finished") {
    return (event.winningTeam === "blue" || event.winningTeam === "red") && typeof event.occurredAt === "string";
  }
  if (event.type === "round_reset") {
    return typeof event.resetAt === "string";
  }
  return false;
}
