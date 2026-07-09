"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Activity, Eye, Radio, Swords, Users } from "lucide-react";
import {
  finishTableWarsV2RealtimeLiteRoundAction,
  joinTableWarsV2Team,
  startNewTableWarsLiteRoundAction,
} from "@/app/actions/table-wars";
import { TableWarsLegends } from "@/components/cafe/table-wars-legends";
import { TableWarsCanvasGame } from "@/components/cafe/table-wars-canvas-game";
import { TableWarsTeamPicker } from "@/components/cafe/table-wars-team-picker";
import {
  createTableWarsRealtimeLiteChannel,
  type TableWarsRealtimeLiteConnectionStatus,
  type TableWarsRealtimeLiteEvent,
} from "@/lib/table-wars/realtime-lite";
import type {
  TableWarsTeam,
  TableWarsV2Event,
  TableWarsV2Snapshot,
} from "@/lib/table-wars/v2-types";

type Props = {
  slug: string;
  initialSnapshot: TableWarsV2Snapshot;
};

function teamLabel(team: TableWarsTeam | "neutral" | null) {
  if (team === "blue") return "الأزرق";
  if (team === "red") return "الأحمر";
  if (team === "neutral") return "محايد";
  return "لم تنضم";
}

function roleLabel(role: TableWarsV2Snapshot["role"]) {
  if (role === "player") return "لاعب";
  if (role === "spectator") return "متفرج";
  if (role === "ai") return "كمبيوتر";
  return "لم تنضم";
}

function roundStatusLabel(status: string | null | undefined) {
  if (status === "active") return "نشطة";
  if (status === "waiting") return "بانتظار اللاعبين";
  if (status === "finished") return "منتهية";
  if (status === "cancelled") return "ملغاة";
  return "غير متاحة";
}

function eventLabel(event: TableWarsV2Event) {
  if (event.eventType === "road_battle") return "اشتباك في الطريق";
  if (event.eventType === "ai_move") return "تحرك الكمبيوتر";
  if (event.eventType === "send_units") return "إرسال جنود";
  if (event.eventType === "arrival") return "وصول جنود";
  return "حدث في الجولة";
}

function formatEventTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[#F2E7D9] bg-[#FCF8F3] px-3 py-3">
      <p className="text-[11px] font-black text-[#806A5E]">{label}</p>
      <p className="mt-1 text-lg font-black text-[#311912]">{value}</p>
    </div>
  );
}

export function TableWarsMultiplayerGame({ slug, initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [message, setMessage] = useState("الجولة تعمل بتزامن لحظي خفيف.");
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<TableWarsRealtimeLiteConnectionStatus>("connecting");
  const [realtimeEvents, setRealtimeEvents] = useState<TableWarsRealtimeLiteEvent[]>([]);
  const [, startFinishing] = useTransition();
  const realtimeChannelRef = useRef<ReturnType<typeof createTableWarsRealtimeLiteChannel> | null>(null);
  const finishedSaveRef = useRef(false);

  const cells = useMemo(
    () => [...snapshot.cells].sort((a, b) => a.slotIndex - b.slotIndex),
    [snapshot.cells],
  );
  const currentPlayer = snapshot.currentPlayer;
  const isRoundFinished = snapshot.roundEnded || snapshot.round?.status === "finished";
  const isPlayer = snapshot.role === "player" && !isRoundFinished;
  const isSpectator = snapshot.role === "spectator";
  const canJoin = !snapshot.currentPlayer && snapshot.round && !isRoundFinished;
  const visibleEvents = snapshot.events.slice(0, 5);
  const realtimeReady = realtimeStatus === "connected";
  const hostPlayer = useMemo(
    () =>
      snapshot.players
        .filter((player) => player.role === "player" && player.customerId)
        .sort((a, b) => {
          const aTime = a.joinedAt ? Date.parse(a.joinedAt) : 0;
          const bTime = b.joinedAt ? Date.parse(b.joinedAt) : 0;
          return aTime - bTime || a.id.localeCompare(b.id);
        })[0] ?? null,
    [snapshot.players],
  );
  const isHost = Boolean(currentPlayer && hostPlayer && currentPlayer.id === hostPlayer.id);

  useEffect(() => {
    if (!snapshot.round?.id || isRoundFinished) {
      realtimeChannelRef.current?.close();
      realtimeChannelRef.current = null;
      setRealtimeStatus("disconnected");
      return;
    }

    const channel = createTableWarsRealtimeLiteChannel({
      roundId: snapshot.round.id,
      cafeSlug: snapshot.cafeSlug,
      onEvent: (event) => {
        setRealtimeEvents((current) => [...current.slice(-80), event]);
      },
      onStatus: (status) => {
        setRealtimeStatus(status);
        if (status === "connected") {
          setMessage("الاتصال اللحظي جاهز.");
        } else if (status === "connecting") {
          setMessage("جاري الاتصال بالمزامنة اللحظية.");
        } else if (status === "error" || status === "disconnected") {
          setMessage("اللعب المحلي مستمر، المزامنة تحاول الاتصال.");
        }
      },
    });
    realtimeChannelRef.current = channel;

    return () => {
      channel.close();
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null;
      }
      setRealtimeStatus("disconnected");
    };
  }, [isRoundFinished, snapshot.cafeSlug, snapshot.round?.id]);

  const handleLocalRealtimeEvent = useCallback((event: TableWarsRealtimeLiteEvent) => {
    if (event.type === "battle") {
      setMessage("اشتباك في الطريق.");
    } else if (event.type === "capture") {
      setMessage("تمت السيطرة على طاولة.");
    } else if (event.type === "round_finished") {
      setMessage("انتهت الجولة.");
    }

    const channel = realtimeChannelRef.current;
    if (!channel) {
      setMessage("اللعب المحلي مستمر، المزامنة تحاول الاتصال.");
      return Promise.resolve();
    }

    return channel
      .send(event)
      .then((status) => {
        if (status === "queued") {
          setMessage("اللعب المحلي مستمر، المزامنة تحاول الاتصال.");
          return;
        }
      })
      .catch(() => {
        setMessage("اللعب المحلي مستمر، المزامنة تحاول الاتصال.");
      });
  }, []);

  const handleRealtimeRoundFinished = useCallback(
    (winningTeam: TableWarsTeam) => {
      if (finishedSaveRef.current) return;
      finishedSaveRef.current = true;
      startFinishing(() => {
        void finishTableWarsV2RealtimeLiteRoundAction(slug, winningTeam)
          .then((nextSnapshot) => {
            setSnapshot(nextSnapshot);
            setError(null);
          })
          .catch((finishError) => {
            finishedSaveRef.current = false;
            setError(finishError instanceof Error ? finishError.message : "تعذر حفظ نتيجة الجولة.");
          });
      });
    },
    [slug],
  );

  const handleStartNewRound = useCallback(() => {
    finishedSaveRef.current = false;
    setRealtimeEvents([]);
    setError(null);
    startFinishing(() => {
      void startNewTableWarsLiteRoundAction(slug)
        .then((nextSnapshot) => {
          setSnapshot(nextSnapshot);
          setMessage("بدأت جولة جديدة.");
        })
        .catch((startError) => {
          setError(startError instanceof Error ? startError.message : "تعذر بدء جولة جديدة.");
        });
    });
  }, [slug]);

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 md:grid-cols-5">
        <StatTile label="فريقك" value={teamLabel(snapshot.team)} />
        <StatTile label="دورك" value={roleLabel(snapshot.role)} />
        <StatTile label="الأزرق" value={snapshot.teamCounts.bluePlayers} />
        <StatTile label="الأحمر" value={snapshot.teamCounts.redPlayers} />
        <StatTile label="الجولة" value={roundStatusLabel(snapshot.round?.status)} />
      </section>

      {canJoin ? (
        <TableWarsTeamPicker
          canJoinBlue={snapshot.canJoinBlue}
          canJoinRed={snapshot.canJoinRed}
          onJoin={(team) => joinTableWarsV2Team(slug, team)}
          onJoined={(nextSnapshot) => {
            setSnapshot(nextSnapshot);
            setMessage("تم الانضمام للجولة.");
          }}
        />
      ) : null}

      {isSpectator ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">
          الفريق ممتلئ، يمكنك مشاهدة الجولة الحالية حتى تنتهي.
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-[#E7D7C6] bg-white shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <div className="grid gap-3 border-b border-[#F2E7D9] bg-[#FFFDF9] p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A281D]/10 text-[#4A281D]">
              {isSpectator ? <Eye className="h-5 w-5" /> : <Swords className="h-5 w-5" />}
            </span>
            <div>
              <h2 className="text-base font-black text-[#311912]">خريطة حرب الطاولات</h2>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">{message}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-800">الأزرق</span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">الأحمر</span>
            <span className="rounded-full border border-[#D9C8B8] bg-[#EDE1D4] px-3 py-1 text-[#4A281D]">
              محايد
            </span>
          </div>
        </div>

        {error ? (
          <p className="border-b border-rose-200 bg-rose-50 p-3 text-sm font-black text-rose-700">{error}</p>
        ) : null}

        <div className="relative">
          <TableWarsCanvasGame
            cells={cells}
            players={snapshot.players}
            externalEvents={realtimeEvents}
            currentPlayer={currentPlayer}
            isPlayer={isPlayer}
            isHost={isHost}
            realtimeReady={realtimeReady}
            realtimeStatus={realtimeStatus}
            initialRoundFinished={isRoundFinished}
            initialWinnerMessage={snapshot.winnerMessage}
            role={snapshot.role}
            onLocalEvent={handleLocalRealtimeEvent}
            onRoundFinished={handleRealtimeRoundFinished}
            onNewRound={handleStartNewRound}
            onMessage={setMessage}
          />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <article className="rounded-lg border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-[#6B3A25]" />
            <h2 className="text-base font-black text-[#311912]">أحداث مختصرة</h2>
          </div>
          {visibleEvents.length === 0 ? (
            <p className="mt-4 rounded-lg border border-[#F2E7D9] bg-[#FCF8F3] p-4 text-sm font-bold text-[#806A5E]">
              لا توجد أحداث حديثة بعد.
            </p>
          ) : (
            <div className="mt-4 grid gap-2">
              {visibleEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#F2E7D9] bg-[#FCF8F3] p-3"
                >
                  <span className="text-sm font-black text-[#311912]">{eventLabel(event)}</span>
                  <span className="text-xs font-bold text-[#806A5E]">{formatEventTime(event.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-lg border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-[#6B3A25]" />
            <h2 className="text-base font-black text-[#311912]">حالة الجولة</h2>
          </div>
          <div className="mt-4 grid gap-2">
            <div className="flex items-center justify-between rounded-lg bg-[#FCF8F3] p-3 text-sm font-bold">
              <span className="text-[#806A5E]">الخلايا</span>
              <span className="text-[#311912]">{cells.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[#FCF8F3] p-3 text-sm font-bold">
              <span className="text-[#806A5E]">أحداث لحظية</span>
              <span className="text-[#311912]">{realtimeEvents.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[#FCF8F3] p-3 text-sm font-bold">
              <span className="text-[#806A5E]">المضيف</span>
              <span className="text-[#311912]">{isHost ? "أنت" : hostPlayer?.displayName ?? "غير متاح"}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#FFF7E3] p-3 text-xs font-black text-[#6B3A25]">
            <Users className="h-4 w-4" />
            تحديث مباشر للجولة
          </div>
        </article>
      </section>

      <TableWarsLegends legends={snapshot.legendsPreview} />
    </div>
  );
}
