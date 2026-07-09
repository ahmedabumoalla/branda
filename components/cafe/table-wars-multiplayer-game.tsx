"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Activity, Eye, Radio, Shield, Swords, Users } from "lucide-react";
import {
  getTableWarsV2SnapshotAction,
  joinTableWarsV2Team,
  sendTableWarsV2UnitsAction,
  tickTableWarsV2Action,
} from "@/app/actions/table-wars";
import { TableWarsLegends } from "@/components/cafe/table-wars-legends";
import { TableWarsTeamPicker } from "@/components/cafe/table-wars-team-picker";
import type {
  TableWarsTeam,
  TableWarsV2Cell,
  TableWarsV2Event,
  TableWarsV2Snapshot,
  TableWarsV2Unit,
} from "@/lib/table-wars/v2-types";

type Props = {
  slug: string;
  initialSnapshot: TableWarsV2Snapshot;
};

const POLLING_MS = 1800;
const MAX_VISUAL_PACKETS = 12;
const MIN_VISUAL_PACKETS = 4;
const PACKET_TRAIL_DELAY = 0.045;

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

function cellClasses(cell: TableWarsV2Cell, selected: boolean, selectable: boolean, canTarget: boolean) {
  const base =
    "absolute z-10 flex h-[54px] w-[54px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 text-center transition active:scale-95 sm:h-[64px] sm:w-[64px]";
  const team =
    cell.team === "blue"
      ? "border-sky-200 bg-sky-500 text-white shadow-[0_0_20px_rgba(14,165,233,0.28)]"
      : cell.team === "red"
        ? "border-rose-200 bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.24)]"
        : "border-[#D9C8B8] bg-[#EDE1D4] text-[#4A281D]";
  const state = selected
    ? "ring-4 ring-[#D9A33F] ring-offset-2 ring-offset-[#F7EFE7]"
    : canTarget
      ? "ring-4 ring-white/80"
      : selectable
        ? "hover:scale-105"
        : "";

  return `${base} ${team} ${state}`;
}

function unitColor(team: TableWarsTeam) {
  return team === "blue" ? "#38BDF8" : "#FB7185";
}

function getLaneOffset(unit: TableWarsV2Unit) {
  return (unit.laneIndex - 1) * 2.4;
}

function unitProgress(unit: TableWarsV2Unit, now: number) {
  const startedAt = unit.startedAt ? Date.parse(unit.startedAt) : now;
  const arrivesAt = unit.arrivesAt ? Date.parse(unit.arrivesAt) : startedAt + 1;
  const duration = Math.max(1, arrivesAt - startedAt);
  return Math.min(1, Math.max(0, (now - startedAt) / duration));
}

function edgePoint(from: TableWarsV2Cell, to: TableWarsV2Cell, progress: number, laneOffset: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const offsetX = (-dy / length) * laneOffset;
  const offsetY = (dx / length) * laneOffset;

  return {
    x: from.x + dx * progress + offsetX,
    y: from.y + dy * progress + offsetY,
  };
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
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [message, setMessage] = useState("الجولة متصلة بالخادم.");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [roadBattleFlash, setRoadBattleFlash] = useState(false);
  const [isSending, startSending] = useTransition();
  const pollingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastRoadBattleEventRef = useRef<string | null>(null);

  const cells = useMemo(
    () => [...snapshot.cells].sort((a, b) => a.slotIndex - b.slotIndex),
    [snapshot.cells],
  );
  const cellById = useMemo(() => new Map(cells.map((cell) => [cell.id, cell])), [cells]);
  const controlledCellIds = useMemo(() => new Set(snapshot.controlledCellIds), [snapshot.controlledCellIds]);
  const currentPlayer = snapshot.currentPlayer;
  const isPlayer = snapshot.role === "player";
  const isSpectator = snapshot.role === "spectator";
  const canJoin = !snapshot.currentPlayer && snapshot.round;
  const visibleEvents = snapshot.events.slice(0, 5);

  const refreshSnapshot = useCallback(async () => {
    const nextSnapshot = await getTableWarsV2SnapshotAction(slug);
    setSnapshot(nextSnapshot);
    setSelectedCellId((current) =>
      current && nextSnapshot.controlledCellIds.includes(current) ? current : null,
    );
  }, [slug]);

  useEffect(() => {
    if (snapshot.units.length === 0) return;

    function updateFrame() {
      setNow(Date.now());
      animationFrameRef.current = window.requestAnimationFrame(updateFrame);
    }

    animationFrameRef.current = window.requestAnimationFrame(updateFrame);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [snapshot.units.length]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      tickTableWarsV2Action()
        .then((nextSnapshot) => {
          setSnapshot(nextSnapshot);
          setSelectedCellId((current) =>
            current && nextSnapshot.controlledCellIds.includes(current) ? current : null,
          );
          setError(null);
        })
        .catch(() => {
          void refreshSnapshot().catch(() => undefined);
        })
        .finally(() => {
          pollingRef.current = false;
        });
    }, POLLING_MS);

    return () => window.clearInterval(poll);
  }, [refreshSnapshot]);

  useEffect(() => {
    const latestRoadBattle = snapshot.events.find((event) => event.eventType === "road_battle");
    if (!latestRoadBattle || latestRoadBattle.id === lastRoadBattleEventRef.current) return;

    lastRoadBattleEventRef.current = latestRoadBattle.id;
    setRoadBattleFlash(true);
    const timeout = window.setTimeout(() => setRoadBattleFlash(false), 900);
    return () => window.clearTimeout(timeout);
  }, [snapshot.events]);

  function handleCellClick(cell: TableWarsV2Cell) {
    if (!isPlayer) return;
    setError(null);

    if (!selectedCellId) {
      if (!controlledCellIds.has(cell.id)) {
        setMessage("اختر قلعتك أو خلية تابعة لفريقك.");
        return;
      }
      if (cell.soldiers < 2) {
        setMessage("تحتاج الخلية إلى جنديين على الأقل.");
        return;
      }
      setSelectedCellId(cell.id);
      setMessage("اختر الهدف.");
      return;
    }

    if (selectedCellId === cell.id) {
      setSelectedCellId(null);
      setMessage("تم إلغاء الاختيار.");
      return;
    }

    startSending(() => {
      void sendTableWarsV2UnitsAction({
        fromCellId: selectedCellId,
        toCellId: cell.id,
      })
        .then((result) => {
          setSnapshot(result.snapshot);
          setSelectedCellId(null);
          setMessage(cell.team === snapshot.team ? "تم إرسال الدعم." : "تم إطلاق الهجوم.");
        })
        .catch((sendError) => {
          setError(sendError instanceof Error ? sendError.message : "تعذر إرسال الجنود.");
        });
    });
  }

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

        <div className="relative h-[620px] max-h-[74vh] min-h-[540px] bg-[#F7EFE7]">
          {roadBattleFlash ? (
            <div className="pointer-events-none absolute inset-x-4 top-4 z-30 rounded-lg border border-amber-200 bg-amber-100/95 px-4 py-3 text-sm font-black text-amber-900 shadow">
              اشتباك في الطريق
            </div>
          ) : null}

          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {snapshot.units.flatMap((unit) => {
              const from = cellById.get(unit.fromCellId);
              const to = cellById.get(unit.toCellId);
              if (!from || !to) return [];

              const laneOffset = getLaneOffset(unit);
              const start = edgePoint(from, to, 0, laneOffset);
              const end = edgePoint(from, to, 1, laneOffset);

              return (
                <line
                  key={unit.id}
                  x1={`${start.x}%`}
                  y1={`${start.y}%`}
                  x2={`${end.x}%`}
                  y2={`${end.y}%`}
                  stroke={unitColor(unit.team)}
                  strokeDasharray="6 8"
                  strokeOpacity="0.45"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {snapshot.units.flatMap((unit) => {
            const from = cellById.get(unit.fromCellId);
            const to = cellById.get(unit.toCellId);
            if (!from || !to) return [];

            const progress = unitProgress(unit, now);
            const point = edgePoint(from, to, progress, getLaneOffset(unit));
            const visualCount = Math.min(MAX_VISUAL_PACKETS, Math.max(MIN_VISUAL_PACKETS, Math.ceil(unit.soldiers / 4)));

            return Array.from({ length: visualCount }).flatMap((_, index) => {
              const trailProgress = progress - index * PACKET_TRAIL_DELAY;
              if (trailProgress <= 0 || trailProgress >= 1) return [];
              const trailPoint = edgePoint(from, to, trailProgress, getLaneOffset(unit) + ((index % 3) - 1) * 0.3);
              return (
                <span
                  key={`${unit.id}-${index}`}
                  className={`absolute z-20 rounded-full ring-white/75 ${
                    index === 0 ? "h-3.5 w-3.5 ring-4" : "h-3 w-3 ring-[3px]"
                  }`}
                  style={{
                    left: `${index === 0 ? point.x : trailPoint.x}%`,
                    top: `${index === 0 ? point.y : trailPoint.y}%`,
                    backgroundColor: unitColor(unit.team),
                    transform: "translate(-50%, -50%)",
                  }}
                />
              );
            });
          })}

          {cells.map((cell) => {
            const selected = selectedCellId === cell.id;
            const selectable = isPlayer && controlledCellIds.has(cell.id);
            const canTarget = Boolean(selectedCellId && selectedCellId !== cell.id);
            const isOwnBase = currentPlayer?.baseCellId === cell.id && cell.assignedPlayerId === currentPlayer.id;

            return (
              <button
                key={cell.id}
                type="button"
                disabled={!isPlayer || isSending}
                onClick={() => handleCellClick(cell)}
                className={cellClasses(cell, selected, selectable, canTarget)}
                style={{ left: `${cell.x}%`, top: `${cell.y}%` }}
                aria-label={`table ${cell.slotIndex} ${teamLabel(cell.team)} ${cell.soldiers}`}
              >
                <span className="text-[9px] font-black leading-none sm:text-[10px]">{cell.slotIndex}</span>
                <span className="mt-1 text-lg font-black leading-none sm:text-xl">{cell.soldiers}</span>
                {isOwnBase ? (
                  <span className="absolute -bottom-6 left-1/2 max-w-[86px] -translate-x-1/2 truncate rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-[#311912] shadow">
                    {currentPlayer.displayName}
                  </span>
                ) : null}
                {selectable ? (
                  <span className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#D9A33F] text-[#311912] ring-2 ring-white">
                    <Shield className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
            );
          })}
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
              <span className="text-[#806A5E]">وحدات متحركة</span>
              <span className="text-[#311912]">{snapshot.units.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[#FCF8F3] p-3 text-sm font-bold">
              <span className="text-[#806A5E]">خلايا تتحكم بها</span>
              <span className="text-[#311912]">{snapshot.controlledCellIds.length}</span>
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
