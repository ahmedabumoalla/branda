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

type GameResult = "playing" | "won" | "lost";

const ROUND_SECONDS = 180;
const UNIT_DURATION = 980;

const initialTowers: Tower[] = [
  { id: "blue-base", label: "طاولتك", owner: "player", soldiers: 28, maxSoldiers: 56, x: 18, y: 72, links: ["middle-left", "center"] },
  { id: "middle-left", label: "طاولة 2", owner: "neutral", soldiers: 14, maxSoldiers: 44, x: 28, y: 45, links: ["blue-base", "top-left", "center"] },
  { id: "top-left", label: "طاولة 3", owner: "neutral", soldiers: 18, maxSoldiers: 46, x: 20, y: 20, links: ["middle-left", "top-center"] },
  { id: "top-center", label: "طاولة 4", owner: "neutral", soldiers: 22, maxSoldiers: 52, x: 50, y: 15, links: ["top-left", "center", "red-base"] },
  { id: "center", label: "الوسط", owner: "neutral", soldiers: 20, maxSoldiers: 58, x: 51, y: 49, links: ["blue-base", "middle-left", "top-center", "middle-right", "bottom-right"] },
  { id: "middle-right", label: "طاولة 6", owner: "neutral", soldiers: 16, maxSoldiers: 44, x: 75, y: 41, links: ["center", "red-base", "bottom-right"] },
  { id: "red-base", label: "طاولة الخصم", owner: "enemy", soldiers: 30, maxSoldiers: 56, x: 82, y: 20, links: ["top-center", "middle-right"] },
  { id: "bottom-right", label: "طاولة 8", owner: "enemy", soldiers: 24, maxSoldiers: 50, x: 78, y: 74, links: ["center", "middle-right"] },
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

function canSendFrom(tower: Tower | undefined, owner: "player" | "enemy") {
  return Boolean(tower && tower.owner === owner && tower.soldiers >= 2);
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

export function TableWarsConquerGame() {
  const [towers, setTowers] = useState<Tower[]>(initialTowers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [units, setUnits] = useState<MovingUnit[]>([]);
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
      if (!canSendFrom(from, owner) || !to || !from?.links.includes(toId)) return false;

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
        lane: (Math.random() - 0.5) * 5,
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
      .filter((tower) => canSendFrom(tower, "enemy"))
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
          if (tower.owner === "neutral") {
            if (tower.soldiers >= tower.maxSoldiers || Math.random() > 0.25) return tower;
            return { ...tower, soldiers: Math.min(tower.maxSoldiers, tower.soldiers + 1) };
          }

          return { ...tower, soldiers: Math.min(tower.maxSoldiers, tower.soldiers + 2) };
        }),
      );
    }, 1000);

    return () => window.clearInterval(growthTimer);
  }, [result]);

  useEffect(() => {
    if (result !== "playing") return;

    const frame = window.setInterval(() => {
      const frameNow = Date.now();
      setNow(frameNow);
      setUnits((current) => {
        const active: MovingUnit[] = [];
        current.forEach((unit) => {
          if (frameNow - unit.startedAt >= unit.duration) {
            resolveArrival(unit);
          } else {
            active.push(unit);
          }
        });
        return active;
      });
    }, 32);

    return () => window.clearInterval(frame);
  }, [resolveArrival, result]);

  useEffect(() => {
    if (result !== "playing") return;

    function scheduleEnemy() {
      const delay = 2500 + Math.random() * 1500;
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
    <section className="overflow-hidden rounded-3xl border border-[#E7D7C6] bg-white shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
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

        {units.map((unit) => {
          const from = getTower(towers, unit.fromId);
          const to = getTower(towers, unit.toId);
          if (!from || !to) return null;

          const progress = Math.min(1, Math.max(0, (now - unit.startedAt) / unit.duration));
          const x = from.x + (to.x - from.x) * progress;
          const y = from.y + (to.y - from.y) * progress + unit.lane;
          const classes = ownerClasses(unit.owner);

          return (
            <span
              key={unit.id}
              className={`absolute z-20 h-3.5 w-3.5 rounded-full ring-4 ring-white/70 ${classes.dot}`}
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            />
          );
        })}

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
                هذه تجربة لعب تجريبية، النقاط والجوائز ستفعّل لاحقًا.
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
              هذه تجربة لعب تجريبية، النقاط والجوائز ستفعّل لاحقًا.
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
