"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Eye, Swords, UserRound } from "lucide-react";
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
  TableWarsV2Snapshot,
} from "@/lib/table-wars/v2-types";

type Props = {
  slug: string;
  initialSnapshot: TableWarsV2Snapshot;
};

const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 20;

function normalizeNickname(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isValidNickname(value: string | null | undefined) {
  const nickname = normalizeNickname(value ?? "");
  return nickname.length >= NICKNAME_MIN_LENGTH && nickname.length <= NICKNAME_MAX_LENGTH;
}

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

function roomLabel(roundId: string | null | undefined) {
  return roundId ? `غرفة #${roundId.slice(0, 4)}` : "غرفة #----";
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#E7D7C6] bg-white px-3 py-2 shadow-[4px_4px_14px_rgba(49,25,18,0.04)]">
      <p className="truncate text-[10px] font-black text-[#806A5E]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-[#311912] sm:text-base">{value}</p>
    </div>
  );
}

export function TableWarsMultiplayerGame({ slug, initialSnapshot }: Props) {
  const [mounted, setMounted] = useState(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [nicknameConfirmed, setNicknameConfirmed] = useState(false);
  const [pendingNickname, setPendingNickname] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [message, setMessage] = useState("الجولة تعمل بتزامن لحظي خفيف.");
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<TableWarsRealtimeLiteConnectionStatus>("connecting");
  const [realtimeEvents, setRealtimeEvents] = useState<TableWarsRealtimeLiteEvent[]>([]);
  const [, startFinishing] = useTransition();
  const [isNicknamePending, startNicknameTransition] = useTransition();
  const realtimeChannelRef = useRef<ReturnType<typeof createTableWarsRealtimeLiteChannel> | null>(null);
  const finishedSaveRef = useRef(false);

  const cells = useMemo(
    () => [...snapshot.cells].sort((a, b) => a.slotIndex - b.slotIndex),
    [snapshot.cells],
  );
  const currentPlayer = snapshot.currentPlayer;
  const isRoundFinished = snapshot.roundEnded || snapshot.round?.status === "finished";
  const isPlayer = currentPlayer?.role === "player" && !isRoundFinished;
  const isSpectator = snapshot.role === "spectator";
  const canJoin = !snapshot.currentPlayer && snapshot.gameEnabled && !isRoundFinished;
  const needsNickname = Boolean(snapshot.gameEnabled && !isRoundFinished && !nicknameConfirmed);
  const canPickTeam = canJoin && nicknameConfirmed && isValidNickname(pendingNickname);
  const canShowGame = Boolean(snapshot.currentPlayer && nicknameConfirmed);
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
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
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
  }, [isRoundFinished, mounted, snapshot.cafeSlug, snapshot.round?.id]);

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
        void finishTableWarsV2RealtimeLiteRoundAction(slug, winningTeam, snapshot.round?.id)
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
    [slug, snapshot.round?.id],
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

  const handleNicknameSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextNickname = normalizeNickname(nicknameInput);
      if (!isValidNickname(nextNickname)) {
        setNicknameError("اكتب اسمًا مستعارًا من 2 إلى 20 حرفًا.");
        return;
      }

      setNicknameError(null);
      setPendingNickname(nextNickname);

      if (!currentPlayer?.team) {
        setNicknameConfirmed(true);
        return;
      }

      startNicknameTransition(() => {
        void joinTableWarsV2Team(slug, currentPlayer.team, nextNickname)
          .then((result) => {
            setSnapshot(result.snapshot);
            setNicknameConfirmed(true);
            setError(null);
            setMessage("تم حفظ اسمك المستعار.");
          })
          .catch((joinError) => {
            setNicknameError(joinError instanceof Error ? joinError.message : "تعذر حفظ الاسم المستعار.");
          });
      });
    },
    [currentPlayer?.team, nicknameInput, slug],
  );

  if (!mounted) {
    return (
      <section className="rounded-lg border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <div className="h-[76dvh] min-h-[560px] max-h-[680px] bg-[#F4E7D7]" aria-label="تحميل حرب الطاولات" />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-5">
      {canShowGame ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:gap-3">
          <StatTile label="فريقك" value={teamLabel(snapshot.team)} />
          <StatTile label="دورك" value={roleLabel(snapshot.role)} />
          <StatTile label="الأزرق" value={snapshot.teamCounts.bluePlayers} />
          <StatTile label="الأحمر" value={snapshot.teamCounts.redPlayers} />
          <StatTile label="الغرفة" value={roomLabel(snapshot.round?.id)} />
          <div className="col-span-2 sm:col-span-1">
            <StatTile label="الجولة" value={roundStatusLabel(snapshot.round?.status)} />
          </div>
        </section>
      ) : null}

      {needsNickname ? (
        <section className="rounded-lg border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A281D]/10 text-[#4A281D]">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-[#311912]">اختر اسمك في الجولة</h2>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">
                هذا الاسم سيظهر للاعبين بدل اسم حسابك الحقيقي.
              </p>
            </div>
          </div>
          <form onSubmit={handleNicknameSubmit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="min-w-0">
              <span className="mb-2 block text-xs font-black text-[#806A5E]">الاسم المستعار</span>
              <input
                value={nicknameInput}
                onChange={(event) => {
                  setNicknameInput(event.target.value);
                  setNicknameError(null);
                }}
                minLength={NICKNAME_MIN_LENGTH}
                maxLength={NICKNAME_MAX_LENGTH}
                required
                className="h-12 w-full rounded-lg border border-[#E7D7C6] bg-[#FFFDF9] px-4 text-sm font-black text-[#311912] outline-none transition focus:border-[#6B3A25]"
              />
            </label>
            <button
              type="submit"
              disabled={isNicknamePending}
              className="self-end rounded-lg bg-[#311912] px-5 py-3 text-sm font-black text-white transition hover:bg-[#4A281D] disabled:cursor-not-allowed disabled:opacity-60"
            >
              متابعة
            </button>
          </form>
          {nicknameError ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-black text-rose-700">
              {nicknameError}
            </p>
          ) : null}
        </section>
      ) : null}

      {canPickTeam ? (
        <TableWarsTeamPicker
          canJoinBlue={snapshot.canJoinBlue}
          canJoinRed={snapshot.canJoinRed}
          onJoin={(team) => joinTableWarsV2Team(slug, team, pendingNickname)}
          onJoined={(nextSnapshot) => {
            setSnapshot(nextSnapshot);
            setNicknameConfirmed(true);
            setMessage("تم الانضمام للجولة.");
          }}
        />
      ) : null}

      {canShowGame && isSpectator ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">
          الفريق ممتلئ، يمكنك مشاهدة الجولة الحالية حتى تنتهي.
        </section>
      ) : null}

      {canShowGame ? (
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
      ) : null}

      <TableWarsLegends legends={snapshot.legendsPreview} />
    </div>
  );
}
