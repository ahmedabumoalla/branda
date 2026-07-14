"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Clock3, LoaderCircle, Swords, UserRound } from "lucide-react";
import {
  finishTableWarsV2RealtimeLiteRoundAction,
  getTableWarsV2SnapshotAction,
  joinTableWarsV2Team,
  leaveTableWarsV2RoundAction,
  startNewTableWarsLiteRoundAction,
  startTableWarsV2LobbyRoundAction,
} from "@/app/actions/table-wars";
import { TableWarsCanvasGame } from "@/components/cafe/table-wars-canvas-game";
import { TableWarsLegends } from "@/components/cafe/table-wars-legends";
import { TableWarsTeamPicker } from "@/components/cafe/table-wars-team-picker";
import {
  createTableWarsRealtimeLiteChannel,
  type TableWarsRealtimeLiteConnectionStatus,
  type TableWarsRealtimeLiteEvent,
} from "@/lib/table-wars/realtime-lite";
import type { TableWarsTeam, TableWarsV2Snapshot } from "@/lib/table-wars/v2-types";

type Props = { slug: string; initialSnapshot: TableWarsV2Snapshot };

const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 20;

function normalizeNickname(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isValidNickname(value: string | null | undefined) {
  const nickname = normalizeNickname(value ?? "");
  return nickname.length >= NICKNAME_MIN_LENGTH && nickname.length <= NICKNAME_MAX_LENGTH;
}

function secondsUntil(value: string | null | undefined) {
  if (!value) return 30;
  return Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 1_000));
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 shadow-sm">
      <p className="truncate text-[10px] font-black text-[#806A5E]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-[#311912]">{value}</p>
    </div>
  );
}

export function TableWarsMultiplayerGame({ slug, initialSnapshot }: Props) {
  const initialNickname = initialSnapshot.currentPlayer?.displayName ?? "";
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [nicknameConfirmed, setNicknameConfirmed] = useState(isValidNickname(initialNickname));
  const [nicknameInput, setNicknameInput] = useState(initialNickname);
  const [pendingNickname, setPendingNickname] = useState(initialNickname);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [message, setMessage] = useState("استعد للسيطرة على الطاولات.");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(secondsUntil(initialSnapshot.round?.lobbyEndsAt));
  const [realtimeStatus, setRealtimeStatus] = useState<TableWarsRealtimeLiteConnectionStatus>("connecting");
  const [realtimeEvents, setRealtimeEvents] = useState<TableWarsRealtimeLiteEvent[]>([]);
  const [startFailure, setStartFailure] = useState<{ message: string; requiresRejoin: boolean } | null>(null);
  const [isNicknamePending, startNicknameTransition] = useTransition();
  const [isRoundPending, startRoundTransition] = useTransition();
  const realtimeChannelRef = useRef<ReturnType<typeof createTableWarsRealtimeLiteChannel> | null>(null);
  const leaveSentForRoundRef = useRef<string | null>(null);
  const startingRoundRef = useRef<string | null>(null);
  const finishedSaveRef = useRef(false);

  const round = snapshot.round;
  const currentPlayer = snapshot.currentPlayer;
  const isLobby = round?.status === "waiting" && currentPlayer?.role === "player";
  const isRoundFinished = snapshot.roundEnded || round?.status === "finished";
  const isPlayer = currentPlayer?.role === "player" && round?.status === "active" && !isRoundFinished;
  const canJoin = !currentPlayer && snapshot.gameEnabled && !isRoundFinished;
  const needsNickname = canJoin && !nicknameConfirmed;
  const canPickTeam = canJoin && nicknameConfirmed && isValidNickname(pendingNickname);
  const canShowGame = Boolean(currentPlayer && nicknameConfirmed && round?.status === "active");
  const cells = useMemo(() => [...snapshot.cells].sort((a, b) => a.slotIndex - b.slotIndex), [snapshot.cells]);
  const hostPlayer = useMemo(
    () => snapshot.players
      .filter((player) => player.role === "player" && player.customerId)
      .filter((player) => player.isConnected && !player.leftAt)
      .sort((a, b) => Date.parse(a.joinedAt ?? "") - Date.parse(b.joinedAt ?? "") || a.id.localeCompare(b.id))[0] ?? null,
    [snapshot.players],
  );
  const isHost = Boolean(currentPlayer && hostPlayer?.id === currentPlayer.id);

  useEffect(() => {
    if (!round?.id || !currentPlayer || round.status === "finished" || round.status === "cancelled") return;
    const roundId = round.id;

    function sendLeave() {
      if (leaveSentForRoundRef.current === roundId) return;
      leaveSentForRoundRef.current = roundId;
      const endpoint = `/api/public/cafe/${encodeURIComponent(slug)}/table-wars/leave`;
      const body = JSON.stringify({ roundId });
      const queued = navigator.sendBeacon?.(endpoint, new Blob([body], { type: "application/json" })) ?? false;
      if (!queued) {
        void fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          credentials: "same-origin",
          keepalive: true,
        }).catch(() => undefined);
      }
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin === window.location.origin && nextUrl.pathname === window.location.pathname) return;
      sendLeave();
    }

    window.addEventListener("pagehide", sendLeave);
    window.addEventListener("beforeunload", sendLeave);
    window.addEventListener("popstate", sendLeave);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("pagehide", sendLeave);
      window.removeEventListener("beforeunload", sendLeave);
      window.removeEventListener("popstate", sendLeave);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [currentPlayer, round?.id, round?.status, slug]);

  useEffect(() => {
    if (!isLobby || !round?.id) return;
    setCountdown(secondsUntil(round.lobbyEndsAt));
    const timer = window.setInterval(() => setCountdown(secondsUntil(round.lobbyEndsAt)), 250);
    const poller = window.setInterval(() => {
      void getTableWarsV2SnapshotAction(slug)
        .then((result) => {
          if (result.ok) setSnapshot(result.snapshot);
        })
        .catch(() => undefined);
    }, 2_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poller);
    };
  }, [isLobby, round?.id, round?.lobbyEndsAt, slug]);

  const startLobbyRound = useCallback(() => {
    if (!round?.id || !currentPlayer?.id || startingRoundRef.current === round.id) return;
    startingRoundRef.current = round.id;
    setStartFailure(null);
    startRoundTransition(() => {
      void startTableWarsV2LobbyRoundAction(slug, round.id, currentPlayer.id)
        .then((result) => {
          if (!result.ok) {
            setStartFailure({ message: result.message, requiresRejoin: result.requiresRejoin });
            return;
          }
          setSnapshot(result.snapshot);
          setMessage("بدأت الجولة باللاعبين الموجودين.");
          setStartFailure(null);
          setError(null);
        })
        .catch((startError) => {
          setStartFailure({
            message: startError instanceof Error ? startError.message : "تعذر بدء الجولة.",
            requiresRejoin: false,
          });
        });
    });
  }, [currentPlayer?.id, round?.id, slug]);

  useEffect(() => {
    if (!isLobby || !round?.id || countdown > 0 || startingRoundRef.current === round.id) return;
    startLobbyRound();
  }, [countdown, isLobby, round?.id, startLobbyRound]);

  const retryLobbyStart = useCallback(() => {
    startingRoundRef.current = null;
    startLobbyRound();
  }, [startLobbyRound]);

  const returnToTeamPicker = useCallback(() => {
    if (!round?.id) return;
    startRoundTransition(() => {
      void leaveTableWarsV2RoundAction(slug, round.id)
        .then(() => getTableWarsV2SnapshotAction(slug))
        .then((result) => {
          if (!result.ok) throw new Error(result.message);
          startingRoundRef.current = null;
          setStartFailure(null);
          setSnapshot(result.snapshot);
          setError(null);
        })
        .catch((leaveError) => {
          setError(leaveError instanceof Error ? leaveError.message : "تعذر الرجوع لاختيار الفريق.");
        });
    });
  }, [round?.id, slug]);

  useEffect(() => {
    if (!canShowGame || !round?.id || isRoundFinished) return;
    const refreshTimer = window.setTimeout(() => {
      void getTableWarsV2SnapshotAction(slug)
        .then((result) => {
          if (result.ok) setSnapshot(result.snapshot);
        })
        .catch(() => undefined);
    }, 750);
    const refreshPoller = window.setInterval(() => {
      void getTableWarsV2SnapshotAction(slug)
        .then((result) => {
          if (!result.ok) return;
          const nextSnapshot = result.snapshot;
          setSnapshot((current) => ({
            ...current,
            currentPlayer: nextSnapshot.currentPlayer,
            players: nextSnapshot.players,
            role: nextSnapshot.role,
            team: nextSnapshot.team,
            teamCounts: nextSnapshot.teamCounts,
          }));
        })
        .catch(() => undefined);
    }, 3_000);
    const channel = createTableWarsRealtimeLiteChannel({
      roundId: round.id,
      cafeSlug: snapshot.cafeSlug,
      onEvent: (event) => setRealtimeEvents((current) => [...current.slice(-80), event]),
      onStatus: (status) => setRealtimeStatus(status),
    });
    realtimeChannelRef.current = channel;
    return () => {
      window.clearTimeout(refreshTimer);
      window.clearInterval(refreshPoller);
      channel.close();
      if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
    };
  }, [canShowGame, isRoundFinished, round?.id, slug, snapshot.cafeSlug]);

  const handleLocalRealtimeEvent = useCallback((event: TableWarsRealtimeLiteEvent) => {
    if (event.type === "battle") setMessage("اشتباك في أحد المسارات.");
    if (event.type === "capture") setMessage("تمت السيطرة على طاولة.");
    if (event.type === "round_finished") setMessage("انتهت الجولة.");
    return realtimeChannelRef.current?.send(event) ?? Promise.resolve();
  }, []);

  const handleRealtimeRoundFinished = useCallback((winningTeam: TableWarsTeam) => {
    if (finishedSaveRef.current) return;
    finishedSaveRef.current = true;
    void finishTableWarsV2RealtimeLiteRoundAction(slug, winningTeam, round?.id)
      .then(setSnapshot)
      .catch((finishError) => {
        finishedSaveRef.current = false;
        setError(finishError instanceof Error ? finishError.message : "تعذر حفظ نتيجة الجولة.");
      });
  }, [round?.id, slug]);

  const handleStartNewRound = useCallback(() => {
    finishedSaveRef.current = false;
    setRealtimeEvents([]);
    void startNewTableWarsLiteRoundAction(slug).then(setSnapshot).catch((startError) => {
      setError(startError instanceof Error ? startError.message : "تعذر تجهيز جولة جديدة.");
    });
  }, [slug]);

  function handleNicknameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickname = normalizeNickname(nicknameInput);
    if (!isValidNickname(nickname)) {
      setNicknameError("اكتب اسمًا مستعارًا من حرفين إلى 20 حرفًا.");
      return;
    }
    setPendingNickname(nickname);
    setNicknameConfirmed(true);
    setNicknameError(null);
    if (currentPlayer?.team) {
      startNicknameTransition(() => {
        void joinTableWarsV2Team(slug, currentPlayer.team, nickname)
          .then((result) => {
            if (!result.ok) {
              setNicknameError(result.message);
              return;
            }
            setSnapshot(result.snapshot);
          })
          .catch((joinError) => setNicknameError(joinError instanceof Error ? joinError.message : "تعذر حفظ الاسم."));
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3">
      {currentPlayer ? (
        <section className="grid grid-cols-3 gap-2">
          <StatTile label="فريقك" value={currentPlayer.team === "blue" ? "الأزرق" : "الأحمر"} />
          <StatTile label="الأزرق" value={`${snapshot.teamCounts.bluePlayers}/2`} />
          <StatTile label="الأحمر" value={`${snapshot.teamCounts.redPlayers}/2`} />
        </section>
      ) : null}

      {needsNickname ? (
        <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#4A281D]/10 text-[#4A281D]"><UserRound className="h-5 w-5" /></span>
            <div><h2 className="font-black text-[#311912]">سجّل اسمك المستعار</h2><p className="text-xs font-bold text-[#806A5E]">سيظهر الاسم فوق الطاولة التي تديرها.</p></div>
          </div>
          <form onSubmit={handleNicknameSubmit} className="mt-4 flex gap-2">
            <input value={nicknameInput} onChange={(event) => setNicknameInput(event.target.value)} minLength={2} maxLength={20} required className="h-11 min-w-0 flex-1 rounded-xl border border-[#E7D7C6] px-3 font-bold outline-none focus:border-[#6B3A25]" aria-label="الاسم المستعار" />
            <button disabled={isNicknamePending} className="rounded-xl bg-[#311912] px-4 text-sm font-black text-white disabled:opacity-60">متابعة</button>
          </form>
          {nicknameError ? <p className="mt-2 text-sm font-bold text-rose-700">{nicknameError}</p> : null}
        </section>
      ) : null}

      {canPickTeam ? (
        <TableWarsTeamPicker canJoinBlue={snapshot.canJoinBlue} canJoinRed={snapshot.canJoinRed} onJoin={(team) => joinTableWarsV2Team(slug, team, pendingNickname)} onJoined={(nextSnapshot) => {
          setSnapshot(nextSnapshot);
          setMessage("تم الانضمام إلى ردهة الانتظار.");
        }} />
      ) : null}

      {isLobby ? (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-5 text-center shadow-sm">
          {startFailure ? (
            <>
              <h2 className="text-lg font-black text-rose-800">تعذر بدء الجولة</h2>
              <p className="mt-2 text-sm font-bold leading-7 text-rose-700">{startFailure.message}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isRoundPending}
                  onClick={retryLobbyStart}
                  className="rounded-xl bg-[#311912] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  إعادة المحاولة
                </button>
                <button
                  type="button"
                  disabled={isRoundPending}
                  onClick={returnToTeamPicker}
                  className="rounded-xl border border-[#E7D7C6] bg-white px-4 py-3 text-sm font-black text-[#6B3A25] disabled:opacity-60"
                >
                  اختيار الفريق مجددًا
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-700">
                <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
              </div>
              <h2 className="mt-3 text-lg font-black text-[#311912]">
                {isRoundPending ? "جاري بدء الجولة" : "بانتظار المنافسين"}
              </h2>
              <p className="mt-1 text-sm font-bold text-[#806A5E]">سيبدأ اللعب بالمتواجدين، والكمبيوتر يكمل المقاعد الفارغة.</p>
            </>
          )}
          <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-white px-5 py-2 text-2xl font-black text-amber-800" aria-live="polite">
            <Clock3 className="h-5 w-5" />
            <span>{countdown}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-black">
            <span className="rounded-xl bg-sky-50 px-3 py-2 text-sky-800">الأزرق {snapshot.teamCounts.bluePlayers}/2</span>
            <span className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800">الأحمر {snapshot.teamCounts.redPlayers}/2</span>
          </div>
        </section>
      ) : null}

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-black text-rose-700">{error}</p> : null}

      {canShowGame ? (
        <section className="overflow-hidden rounded-2xl border border-[#E7D7C6] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-[#F2E7D9] bg-[#FFFDF9] p-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#4A281D]/10 text-[#4A281D]"><Swords className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-black text-[#311912]">حرب الطاولات</h2><p className="text-[11px] font-bold text-[#806A5E]">{message}</p></div>
          </div>
          <TableWarsCanvasGame cells={cells} players={snapshot.players} externalEvents={realtimeEvents} currentPlayer={currentPlayer} isPlayer={isPlayer} isHost={isHost} realtimeReady={realtimeStatus === "connected"} realtimeStatus={realtimeStatus} initialRoundFinished={isRoundFinished} initialWinnerMessage={snapshot.winnerMessage} role={snapshot.role} onLocalEvent={handleLocalRealtimeEvent} onRoundFinished={handleRealtimeRoundFinished} onNewRound={handleStartNewRound} onMessage={setMessage} />
        </section>
      ) : null}

      <TableWarsLegends legends={snapshot.legendsPreview} />
    </div>
  );
}
