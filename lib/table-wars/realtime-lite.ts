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

export type TableWarsRealtimeLiteConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type TableWarsRealtimeLiteSendStatus = "ok" | "queued" | "error";

type RealtimeLiteInput = {
  roundId: string | null;
  cafeSlug: string;
  onEvent: (event: TableWarsRealtimeLiteEvent) => void;
  onStatus?: (status: TableWarsRealtimeLiteConnectionStatus) => void;
};

const MAX_QUEUED_EVENTS = 120;
const INITIAL_RETRY_MS = 2_000;
const MAX_RETRY_MS = 15_000;

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
  const channelName = tableWarsRealtimeLiteChannelName(roundId, cafeSlug);
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let status: TableWarsRealtimeLiteConnectionStatus = "connecting";
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelayMs = INITIAL_RETRY_MS;
  let queuedEvents: TableWarsRealtimeLiteEvent[] = [];

  function setStatus(nextStatus: TableWarsRealtimeLiteConnectionStatus) {
    status = nextStatus;
    onStatus?.(nextStatus);
  }

  function queueEvent(event: TableWarsRealtimeLiteEvent) {
    queuedEvents = [...queuedEvents.slice(-(MAX_QUEUED_EVENTS - 1)), event];
  }

  async function sendNow(event: TableWarsRealtimeLiteEvent): Promise<TableWarsRealtimeLiteSendStatus> {
    if (!channel || status !== "connected") return "queued";

    try {
      const result = await channel.send({
        type: "broadcast",
        event: "table_wars_lite",
        payload: event,
      });
      return result === "ok" ? "ok" : "error";
    } catch {
      return "error";
    }
  }

  async function flushQueue() {
    if (status !== "connected" || queuedEvents.length === 0) return;

    const pending = queuedEvents;
    queuedEvents = [];

    for (const event of pending) {
      const result = await sendNow(event);
      if (result !== "ok") {
        queueEvent(event);
        scheduleReconnect("error");
        break;
      }
    }
  }

  function clearRetryTimer() {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleReconnect(nextStatus: "disconnected" | "error") {
    if (closed) return;
    setStatus(nextStatus);
    if (retryTimer) return;

    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (closed) return;
      connect();
      retryDelayMs = Math.min(MAX_RETRY_MS, retryDelayMs * 1.6);
    }, retryDelayMs);
  }

  function connect() {
    if (closed) return;
    clearRetryTimer();
    setStatus("connecting");

    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }

    const nextChannel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });
    channel = nextChannel;

    nextChannel.on("broadcast", { event: "table_wars_lite" }, ({ payload }) => {
      if (isTableWarsRealtimeLiteEvent(payload)) {
        onEvent(payload);
      }
    });

    nextChannel.subscribe((subscribeStatus) => {
      if (closed || channel !== nextChannel) return;

      if (subscribeStatus === "SUBSCRIBED") {
        retryDelayMs = INITIAL_RETRY_MS;
        setStatus("connected");
        void flushQueue();
      } else if (subscribeStatus === "CHANNEL_ERROR" || subscribeStatus === "TIMED_OUT") {
        scheduleReconnect("error");
      } else if (subscribeStatus === "CLOSED") {
        scheduleReconnect("disconnected");
      }
    });
  }

  connect();

  return {
    send(event: TableWarsRealtimeLiteEvent): Promise<TableWarsRealtimeLiteSendStatus> {
      if (status !== "connected") {
        queueEvent(event);
        if (status !== "connecting") scheduleReconnect(status === "error" ? "error" : "disconnected");
        return Promise.resolve("queued");
      }

      return sendNow(event).then((result) => {
        if (result === "ok") return "ok";
        queueEvent(event);
        scheduleReconnect("error");
        return "queued";
      });
    },
    getStatus() {
      return status;
    },
    close() {
      closed = true;
      clearRetryTimer();
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      setStatus("disconnected");
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
