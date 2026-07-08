"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Shield, Sparkles, Swords } from "lucide-react";

type Owner = "player" | "enemy" | "neutral";

type Tower = {
  id: string;
  label: string;
  owner: Owner;
  soldiers: number;
  maxSoldiers: number;
  x: number;
  y: number;
  links: string[];
};

type MovingUnit = {
  id: string;
  owner: Exclude<Owner, "neutral">;
  fromId: string;
  toId: string;
  soldiers: number;
  startedAt: number;
  duration: number;
  lane: number;
};

type BattleSpark = {
  id: string;
  x: number;
  y: number;
  createdAt: number;
};

type GameResult = "playing" | "won" | "lost";

const ROUND_SECONDS = 180;
const UNIT_DURATION = 1800;
const COLLISION_DISTANCE = 0.06;
const SOLDIER_TRAIL_SPACING = 0.045;
const BATTLE_SPARK_MS = 650;

const initialTowers: Tower[] = [
  {
    id: "blue-base",
    label: "طاولتك",
    owner: "player",
    soldiers: 28,
    maxSoldiers: 56,
    x: 18,
    y: 72,
    links: ["middle-left", "center"],
  },
  {
    id: "middle-left",
    label: "طاولة 2",
    owner: "neutral",
    soldiers: 14,
    maxSoldiers: 44,
    x: 28,
    y: 45,
    links: ["blue-base", "top-left", "center"],
  },
  {
    id: "top-left",
    label: "طاولة 3",
    owner: "neutral",
    soldiers: 18,
    maxSoldiers: 46,
    x: 20,
    y: 20,
    links: ["middle-left", "top-center"],
  },
  {
    id: "top-center",
    label: "طاولة 4",
    owner: "neutral",
    soldiers: 22,
    maxSoldiers: 52,
    x: 50,
    y: 15,
    links: ["top-left", "center", "red-base"],
  },
  {
    id: "center",
    label: "الوسط",
    owner: "neutral",
    soldiers: 20,
    maxSoldiers: 58,
    x: 51,
    y: 49,
    links: ["blue-base", "middle-left", "top-center", "middle-right", "bottom-right"],
  },
  {
    id: "middle-right",
    label: "طاولة 6",
    owner: "neutral",
    soldiers: 16,
    maxSoldiers: 44,
    x: 75,
    y: 41,
    links: ["center", "red-base", "bottom-right"],
  },
  {
    id: "red-base",
    label: "طاولة الخصم",
    owner: "enemy",
    soldiers: 30,
    maxSoldiers: 56,
    x: 82,
    y: 20,
    links: ["top-center", "middle-right"],
  },
  {
    id: "bottom-right",
    label: "طاولة 8",
    owner: "enemy",
    soldiers: 24,
    maxSoldiers: 50,
    x: 78,
    y: 74,
    links: ["center", "middle-right"],
  },
];

function ownerClasses(owner: Owner) {
  if (owner === "player") {
    return {
      tower: "border-sky-200 bg-sky-500 text-white shadow-[0_0_24px_rgba(14,165,233,0.42)]",
      dot: "bg-sky-400",
      text: "text-sky-700",
      line: "#38BDF8",
    };
  }
  if (owner === "enemy") {
    return {
      tower: "border-rose-200 bg-rose-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.34)]",
      dot: "bg-rose-400",
      text: "text-rose-700",
      line: "#FB7185",
    };
  }
  return {
    tower: "border-[#D9C8B8] bg-[#EDE1D4] text-[#4A281D] shadow-[0_12px_28px_rgba(74,40,29,0.12)]",
    dot: "bg-[#B8A99A]",
    text: "text-[#806A5E]",
    line: "#D8C4B3",
  };
}

function ownerLabel(owner: Owner) {
  if (owner === "player") return "أنت";
  if (owner === "enemy") return "الخصم";
  return "محايدة";
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function getTower(towers: Tower[], id: string) {
  return towers.find((tower) => tower.id === id);
}

function canSendFrom(tower: Tower | undefined, owner: "player" | "enemy", minSoldiers = 2) {
  return Boolean(tower && tower.owner === owner && tower.soldiers >= minSoldiers);
}

function getUnitProgress(unit: MovingUnit, timestamp: number) {
  return Math.min(1, Math.max(0, (timestamp - unit.startedAt) / unit.duration));
}

function getVisualCount(soldiers: number) {
  if (soldiers <= 0) return 0;
  if (soldiers <= 6) return soldiers;
  return Math.min(12, Math.max(6, Math.ceil(soldiers * 0.65)));
}

function getEdgePoint(from: Tower, to: Tower, progress: number, lane: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const offsetX = (-dy / length) * lane;
  const offsetY = (dx / length) * lane;

  return {
    x: from.x + dx * progress + offsetX,
    y: from.y + dy * progress + offsetY,
  };
}

function uniqueLinks(towers: Tower[]) {
  const seen = new Set<string>();
  return towers.flatMap((tower) =>
    tower.links.flatMap((targetId) => {
      const key = [tower.id, targetId].sort().join("-");
      if (seen.has(key)) return [];
      const target = getTower(towers, targetId);
      if (!target) return [];
      seen.add(key);
      return [{ from: tower, to: target }];
    }),
  );
}

function areOpposingUnits(unitA: MovingUnit, unitB: MovingUnit) {
  return (
    unitA.owner !== unitB.owner &&
    unitA.fromId === unitB.toId &&
    unitA.toId === unitB.fromId
  );
}

export function TableWarsConquerGame() {
  const [towers, setTowers] = useState<Tower[]>(initialTowers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [units, setUnits] = useState<MovingUnit[]>([]);
  const [battleSparks, setBattleSparks] = useState<BattleSpark[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<GameResult>("playing");
  const [message, setMessage] = useState("اختر طاولة زرقاء ثم اختر طاولة متصلة للهجوم.");
  const enemyTimerRef = useRef<number | null>(null);
  const towersRef = useRef(towers);
  const resultRef = useRef(result);

  const playerCount = useMemo(() => towers.filter((tower) => tower.owner === "player").length, [towers]);
  const enemyCount = useMemo(() => towers.filter((tower) => tower.owner === "enemy").length, [towers]);
  const links = useMemo(() => uniqueLinks(towers), [towers]);
  const selectedTower = selectedId ? getTower(towers, selectedId) : undefined;
  const reachableIds = useMemo(() => new Set(selectedTower?.links ?? []), [selectedTower]);
  const timeLeft = Math.max(0, ROUND_SECONDS - elapsed);

  const resolveArrival = useCallback((unit: MovingUnit) => {
    setTowers((current) =>
      current.map((tower) => {
        if (tower.id !== unit.toId) return tower;

        if (tower.owner === unit.owner) {
          return { ...tower, soldiers: Math.min(tower.maxSoldiers, tower.soldiers + unit.soldiers) };
        }

        if (unit.soldiers > tower.soldiers) {
          return { ...tower, owner: unit.owner, soldiers: Math.max(1, unit.soldiers - tower.soldiers) };
        }

        return { ...tower, soldiers: Math.max(0, tower.soldiers - unit.soldiers) };
      }),
    );
  }, []);

  const sendUnits = useCallback(
    (fromId: string, toId: string, owner: "player" | "enemy") => {
      const from = getTower(towersRef.current, fromId);
      const to = getTower(towersRef.current, toId);
      const minSoldiers = owner === "enemy" ? 8 : 2;
      if (!canSendFrom(from, owner, minSoldiers) || !to || !from?.links.includes(toId)) return false;

      const soldiers = Math.floor(from.soldiers / 2);
      if (soldiers < 1) return false;

      const createdUnit: MovingUnit = {
        id: `${owner}-${fromId}-${toId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        owner,
        fromId,
        toId,
        soldiers,
        startedAt: Date.now(),
        duration: UNIT_DURATION,
        lane: (Math.random() - 0.5) * 4,
      };

      setTowers((current) => {
        return current.map((tower) =>
          tower.id === fromId ? { ...tower, soldiers: Math.max(0, tower.soldiers - soldiers) } : tower,
        );
      });

      setUnits((current) => [...current, createdUnit]);
      return true;
    },
    [],
  );

  const handleTowerClick = useCallback(
    (tower: Tower) => {
      if (result !== "playing") return;

      if (!selectedId) {
        if (tower.owner === "player" && tower.soldiers >= 2) {
          setSelectedId(tower.id);
          setMessage("اختر طاولة متصلة لإرسال نصف الجنود.");
        } else {
          setMessage("اختر طاولة زرقاء فيها جنديان على الأقل.");
        }
        return;
      }

      const source = getTower(towers, selectedId);
      if (tower.id === selectedId) {
        setSelectedId(null);
        setMessage("تم إلغاء الاختيار.");
        return;
      }

      if (!source || source.owner !== "player") {
        setSelectedId(null);
        setMessage("اختر طاولة زرقاء أولًا.");
        return;
      }

      if (!source.links.includes(tower.id)) {
        setMessage("هذه الطاولة غير متصلة بالمصدر.");
        return;
      }

      const sent = sendUnits(source.id, tower.id, "player");
      if (sent) {
        setSelectedId(null);
        setMessage("انطلقت وحداتك نحو الطاولة الهدف.");
      } else {
        setMessage("لا يمكن الإرسال الآن، انتظر زيادة الجنود.");
      }
    },
    [result, selectedId, sendUnits, towers],
  );

  const enemyMove = useCallback(() => {
    const currentTowers = towersRef.current;
    if (resultRef.current !== "playing") return;

    const enemySources = currentTowers
      .filter((tower) => canSendFrom(tower, "enemy", 8))
      .sort((a, b) => b.soldiers - a.soldiers);

    for (const source of enemySources) {
      const candidates = source.links
        .map((id) => getTower(currentTowers, id))
        .filter((tower): tower is Tower => Boolean(tower && tower.owner !== "enemy"));

      if (!candidates.length) continue;

      const target =
        candidates
          .filter((tower) => tower.owner === "neutral")
          .sort((a, b) => a.soldiers - b.soldiers)[0] ??
        candidates
          .filter((tower) => tower.owner === "player")
          .sort((a, b) => a.soldiers - b.soldiers)[0] ??
        candidates[0];

      if (target && sendUnits(source.id, target.id, "enemy")) {
        setMessage("الخصم تحرك نحو طاولة قريبة.");
        return;
      }
    }
  }, [sendUnits]);

  function resetGame() {
    setTowers(initialTowers);
    setSelectedId(null);
    setUnits([]);
    setBattleSparks([]);
    setNow(Date.now());
    setElapsed(0);
    setResult("playing");
    setMessage("اختر طاولة زرقاء ثم اختر طاولة متصلة للهجوم.");
  }

  useEffect(() => {
    towersRef.current = towers;
  }, [towers]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    if (result !== "playing") return;

    const growthTimer = window.setInterval(() => {
      setElapsed((value) => value + 1);
      setTowers((current) =>
        current.map((tower) => {
          if (tower.owner === "neutral" || tower.soldiers >= tower.maxSoldiers) return tower;

          return { ...tower, soldiers: Math.min(tower.maxSoldiers, tower.soldiers + 1) };
        }),
      );
    }, 1000);

    return () => window.clearInterval(growthTimer);
  }, [result]);

  useEffect(() => {
    if (result !== "playing") return;

    const frame = window.setInterval(() => {
      const frameNow = Date.now();
      const currentTowers = towersRef.current;

      setNow(frameNow);
      setBattleSparks((current) => current.filter((spark) => frameNow - spark.createdAt < BATTLE_SPARK_MS));
      setUnits((current) => {
        const active: MovingUnit[] = [];

        current.forEach((unit) => {
          if (frameNow - unit.startedAt >= unit.duration) {
            resolveArrival(unit);
          } else {
            active.push({ ...unit });
          }
        });

        const removedIds = new Set<string>();
        const newSparks: BattleSpark[] = [];

        for (let i = 0; i < active.length; i += 1) {
          const unitA = active[i];
          if (!unitA || removedIds.has(unitA.id)) continue;

          for (let j = i + 1; j < active.length; j += 1) {
            const unitB = active[j];
            if (!unitB || removedIds.has(unitB.id) || !areOpposingUnits(unitA, unitB)) continue;

            const progressA = getUnitProgress(unitA, frameNow);
            const progressB = getUnitProgress(unitB, frameNow);
            if (Math.abs(progressA - (1 - progressB)) >= COLLISION_DISTANCE) continue;

            const from = getTower(currentTowers, unitA.fromId);
            const to = getTower(currentTowers, unitA.toId);
            if (from && to) {
              const point = getEdgePoint(from, to, progressA, (unitA.lane - unitB.lane) / 2);
              newSparks.push({
                id: `battle-${frameNow}-${unitA.id}-${unitB.id}`,
                x: point.x,
                y: point.y,
                createdAt: frameNow,
              });
            }

            if (unitA.soldiers > unitB.soldiers) {
              unitA.soldiers -= unitB.soldiers;
              removedIds.add(unitB.id);
            } else if (unitB.soldiers > unitA.soldiers) {
              unitB.soldiers -= unitA.soldiers;
              removedIds.add(unitA.id);
              break;
            } else {
              removedIds.add(unitA.id);
              removedIds.add(unitB.id);
              break;
            }
          }
        }

        if (newSparks.length) {
          setBattleSparks((currentSparks) => [...currentSparks, ...newSparks]);
          setMessage("اشتباك في الطريق!");
        }

        return active.filter((unit) => !removedIds.has(unit.id) && unit.soldiers > 0);
      });
    }, 32);

    return () => window.clearInterval(frame);
  }, [resolveArrival, result]);

  useEffect(() => {
    if (result !== "playing") return;

    function scheduleEnemy() {
      const delay = 3500 + Math.random() * 1500;
      enemyTimerRef.current = window.setTimeout(() => {
        enemyMove();
        scheduleEnemy();
      }, delay);
    }

    scheduleEnemy();
    return () => {
      if (enemyTimerRef.current) window.clearTimeout(enemyTimerRef.current);
    };
  }, [enemyMove, result]);

  useEffect(() => {
    if (result !== "playing") return;
    if (playerCount === towers.length) {
      setResult("won");
      setMessage("فزت في حرب الطاولات");
      return;
    }
    if (enemyCount === towers.length) {
      setResult("lost");
      setMessage("خسرت الجولة");
    }
  }, [enemyCount, playerCount, result, towers.length]);

  const overlayTitle = result === "won" ? "فزت في حرب الطاولات" : result === "lost" ? "خسرت الجولة" : null;
  const overlayButton = result === "won" ? "إعادة اللعب" : "إعادة المحاولة";

  return (
    <section
      dir="rtl"
      className="overflow-hidden rounded-3xl border border-[#E7D7C6] bg-white shadow-[8px_8px_28px_rgba(49,25,18,0.06)]"
    >
      <div className="border-b border-[#F2E7D9] bg-[#FFFDF9] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-[#6B3A25]">Branda Play</p>
            <h2 className="mt-1 text-2xl font-black text-[#311912]">حرب الطاولات</h2>
            <p className="mt-1 text-sm font-bold leading-7 text-[#806A5E]">سيطر على الطاولات قبل الخصم.</p>
          </div>
          <button
            type="button"
            onClick={resetGame}
            aria-label="إعادة اللعب"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E7D7C6] bg-white text-[#6B3A25] transition active:scale-95"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-sky-50 px-2 py-3">
            <p className="text-[11px] font-black text-sky-700">طاولاتك</p>
            <p className="mt-1 text-xl font-black text-[#311912]">{playerCount}</p>
          </div>
          <div className="rounded-2xl bg-rose-50 px-2 py-3">
            <p className="text-[11px] font-black text-rose-700">طاولات الخصم</p>
            <p className="mt-1 text-xl font-black text-[#311912]">{enemyCount}</p>
          </div>
          <div className="rounded-2xl bg-[#FCF8F3] px-2 py-3">
            <p className="text-[11px] font-black text-[#806A5E]">الوقت</p>
            <p className="mt-1 text-xl font-black text-[#311912]">{formatTime(timeLeft)}</p>
          </div>
        </div>
      </div>

      <div className="relative mx-auto h-[560px] max-h-[70vh] min-h-[500px] w-full bg-[#F7EFE7] sm:h-[620px]">
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          {links.map(({ from, to }) => {
            const sourceColor = ownerClasses(from.owner).line;
            return (
              <line
                key={`${from.id}-${to.id}`}
                x1={`${from.x}%`}
                y1={`${from.y}%`}
                x2={`${to.x}%`}
                y2={`${to.y}%`}
                stroke={sourceColor}
                strokeOpacity="0.42"
                strokeWidth="5"
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {units.flatMap((unit) => {
          const from = getTower(towers, unit.fromId);
          const to = getTower(towers, unit.toId);
          if (!from || !to) return [];

          const baseProgress = getUnitProgress(unit, now);
          const visualCount = getVisualCount(unit.soldiers);
          const classes = ownerClasses(unit.owner);

          return Array.from({ length: visualCount }).flatMap((_, index) => {
            const progress = baseProgress - index * SOLDIER_TRAIL_SPACING;
            if (progress <= 0 || progress >= 1) return [];

            const staggerLane = unit.lane + ((index % 3) - 1) * 0.35;
            const point = getEdgePoint(from, to, progress, staggerLane);
            const isLead = index === 0;

            return (
              <span
                key={`${unit.id}-${index}`}
                className={`absolute z-20 rounded-full ring-white/70 ${classes.dot} ${
                  isLead ? "h-3.5 w-3.5 ring-4" : "h-3 w-3 ring-[3px]"
                }`}
                style={{ left: `${point.x}%`, top: `${point.y}%`, transform: "translate(-50%, -50%)" }}
              />
            );
          });
        })}

        {battleSparks.map((spark) => (
          <span
            key={spark.id}
            className="absolute z-20 flex h-10 w-10 items-center justify-center rounded-full bg-amber-300/80 text-[11px] font-black text-[#311912] ring-4 ring-white/80"
            style={{
              left: `${spark.x}%`,
              top: `${spark.y}%`,
              opacity: Math.max(0, 1 - (now - spark.createdAt) / BATTLE_SPARK_MS),
              transform: "translate(-50%, -50%) scale(1.05)",
            }}
          >
            ×
          </span>
        ))}

        {towers.map((tower) => {
          const selected = selectedId === tower.id;
          const reachable = reachableIds.has(tower.id);
          const classes = ownerClasses(tower.owner);

          return (
            <button
              key={tower.id}
              type="button"
              onClick={() => handleTowerClick(tower)}
              className={`absolute z-10 flex h-[74px] w-[74px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 text-center transition active:scale-95 sm:h-[86px] sm:w-[86px] ${
                classes.tower
              } ${selected ? "ring-4 ring-[#D9A33F] ring-offset-4 ring-offset-[#F7EFE7]" : ""} ${
                reachable ? "scale-105 ring-4 ring-white/80" : ""
              }`}
              style={{ left: `${tower.x}%`, top: `${tower.y}%` }}
              aria-label={`${tower.label} ${ownerLabel(tower.owner)} ${tower.soldiers} جندي`}
            >
              <span className="text-[10px] font-black leading-none sm:text-xs">{tower.label}</span>
              <span className="mt-1 text-xl font-black leading-none sm:text-2xl">{tower.soldiers}</span>
            </button>
          );
        })}

        {overlayTitle ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#311912]/45 p-5 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl border border-white/50 bg-white p-6 text-center shadow-[0_24px_70px_rgba(49,25,18,0.24)]">
              <Sparkles className="mx-auto h-9 w-9 text-[#D9A33F]" />
              <h3 className="mt-3 text-2xl font-black text-[#311912]">{overlayTitle}</h3>
              <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
                هذه تجربة لعب تجريبية، النقاط والجوائز ستفعل لاحقًا.
              </p>
              <button
                type="button"
                onClick={resetGame}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#311912] px-5 text-sm font-black text-white transition active:scale-95"
              >
                <RotateCcw className="h-4 w-4" />
                {overlayButton}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-[#F2E7D9] bg-white p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-black text-[#311912]">{message}</p>
            <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">
              اختر طاولة زرقاء ثم اختر طاولة متصلة للهجوم.
            </p>
            <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">
              قد تتقاتل الجنود في الطريق إذا تقابلت من اتجاهين متعاكسين.
            </p>
            <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">
              هذه تجربة لعب تجريبية، النقاط والجوائز ستفعل لاحقًا.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-[#FCF8F3] px-4 py-3 text-xs font-black text-[#6B3A25]">
          <Swords className="h-4 w-4" />
          إرسال نصف الجنود
        </div>
      </div>
    </section>
  );
}
