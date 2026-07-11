"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChefHat, Coffee, RotateCcw, Shield, Zap } from "lucide-react";

type Team = "player" | "bot";
type UnitState = "moving" | "attacking";
type UnitKind = "swift_waiter" | "strong_chef" | "branch_guard";
type GameResult = "playing" | "won" | "lost";

type CardDef = {
  kind: UnitKind;
  name: string;
  shortName: string;
  icon: string;
  hp: number;
  speed: number;
  damage: number;
  cost: number;
};

type Unit = {
  id: string;
  kind: UnitKind;
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  team: Team;
  x: number;
  y: number;
  state: UnitState;
  lastAttackAt: number;
};

type Bases = {
  player: number;
  bot: number;
};

const MAX_ENERGY = 10;
const START_ENERGY = 5;
const BASE_HP = 160;
const LANES = [31, 50, 69];
const ATTACK_RANGE = 5.5;
const LANE_RANGE = 9.5;
const ATTACK_COOLDOWN_MS = 820;
const ENERGY_PER_SECOND = 0.72;
const BOT_SPAWN_SECONDS = 3.4;

const CARDS: CardDef[] = [
  {
    kind: "swift_waiter",
    name: "النادل السريع",
    shortName: "النادل",
    icon: "☕",
    hp: 42,
    speed: 10.5,
    damage: 9,
    cost: 3,
  },
  {
    kind: "strong_chef",
    name: "الطاهي القوي",
    shortName: "الطاهي",
    icon: "🍳",
    hp: 88,
    speed: 5.2,
    damage: 17,
    cost: 5,
  },
  {
    kind: "branch_guard",
    name: "حارس الفرع",
    shortName: "الحارس",
    icon: "🛡",
    hp: 112,
    speed: 4.4,
    damage: 11,
    cost: 4,
  },
];

function makeInitialBases(): Bases {
  return { player: BASE_HP, bot: BASE_HP };
}

function getCard(kind: UnitKind) {
  return CARDS.find((card) => card.kind === kind) ?? CARDS[0];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function basePercent(value: number) {
  return `${clamp((value / BASE_HP) * 100, 0, 100)}%`;
}

function resultLabel(result: GameResult) {
  if (result === "won") return "فزت";
  if (result === "lost") return "خسرت";
  return "المعركة مستمرة";
}

function CardIcon({ kind }: { kind: UnitKind }) {
  if (kind === "strong_chef") return <ChefHat className="h-4 w-4" />;
  if (kind === "branch_guard") return <Shield className="h-4 w-4" />;
  return <Coffee className="h-4 w-4" />;
}

export function BattleArenaGame() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [bases, setBases] = useState<Bases>(() => makeInitialBases());
  const [energy, setEnergy] = useState(START_ENERGY);
  const [result, setResult] = useState<GameResult>("playing");
  const [notice, setNotice] = useState("اختر بطاقة لإرسالها إلى الممر.");

  const unitsRef = useRef<Unit[]>([]);
  const basesRef = useRef<Bases>(makeInitialBases());
  const energyRef = useRef(START_ENERGY);
  const resultRef = useRef<GameResult>("playing");
  const nextUnitIdRef = useRef(1);
  const nextLaneRef = useRef(0);
  const botTimerRef = useRef(1.4);
  const botCardIndexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  const syncUnits = useCallback((nextUnits: Unit[]) => {
    unitsRef.current = nextUnits;
    setUnits(nextUnits);
  }, []);

  const syncBases = useCallback((nextBases: Bases) => {
    basesRef.current = nextBases;
    setBases(nextBases);
  }, []);

  const syncEnergy = useCallback((nextEnergy: number) => {
    const rounded = Number(clamp(nextEnergy, 0, MAX_ENERGY).toFixed(2));
    energyRef.current = rounded;
    setEnergy(rounded);
  }, []);

  const syncResult = useCallback((nextResult: GameResult) => {
    resultRef.current = nextResult;
    setResult(nextResult);
  }, []);

  const spawnUnit = useCallback(
    (team: Team, card: CardDef) => {
      const laneIndex = team === "player" ? nextLaneRef.current : botCardIndexRef.current;
      const lane = LANES[laneIndex % LANES.length];
      if (team === "player") nextLaneRef.current += 1;

      const nextUnit: Unit = {
        id: `${team}-${nextUnitIdRef.current}`,
        kind: card.kind,
        name: card.name,
        icon: card.icon,
        hp: card.hp,
        maxHp: card.hp,
        speed: card.speed,
        damage: card.damage,
        team,
        x: team === "player" ? 14 : 86,
        y: lane,
        state: "moving",
        lastAttackAt: 0,
      };

      nextUnitIdRef.current += 1;
      syncUnits([...unitsRef.current, nextUnit]);
    },
    [syncUnits],
  );

  const playCard = useCallback(
    (card: CardDef) => {
      if (resultRef.current !== "playing") return;

      if (energyRef.current < card.cost) {
        setNotice("الطاقة غير كافية لهذه البطاقة.");
        return;
      }

      syncEnergy(energyRef.current - card.cost);
      spawnUnit("player", card);
      setNotice(`${card.name} دخل أرض المعركة.`);
    },
    [spawnUnit, syncEnergy],
  );

  const resetGame = useCallback(() => {
    syncUnits([]);
    syncBases(makeInitialBases());
    syncEnergy(START_ENERGY);
    syncResult("playing");
    setNotice("جولة جديدة بدأت.");
    nextUnitIdRef.current = 1;
    nextLaneRef.current = 0;
    botTimerRef.current = 1.4;
    botCardIndexRef.current = 0;
    lastFrameRef.current = null;
  }, [syncBases, syncEnergy, syncResult, syncUnits]);

  useEffect(() => {
    function frame(now: number) {
      const previous = lastFrameRef.current ?? now;
      const deltaSeconds = Math.min((now - previous) / 1000, 0.05);
      lastFrameRef.current = now;

      if (resultRef.current === "playing") {
        if (energyRef.current < MAX_ENERGY) {
          syncEnergy(energyRef.current + deltaSeconds * ENERGY_PER_SECOND);
        }

        botTimerRef.current -= deltaSeconds;
        if (botTimerRef.current <= 0) {
          const botDeck = [CARDS[0], CARDS[2], CARDS[0], CARDS[1]];
          const card = botDeck[botCardIndexRef.current % botDeck.length] ?? CARDS[0];
          botCardIndexRef.current += 1;
          spawnUnit("bot", card);
          botTimerRef.current = BOT_SPAWN_SECONDS + (botCardIndexRef.current % 2) * 0.7;
        }

        const nextBases = { ...basesRef.current };
        const nextUnits = unitsRef.current
          .filter((unit) => unit.hp > 0)
          .map((unit) => ({ ...unit }));

        for (const unit of nextUnits) {
          if (unit.hp <= 0) continue;

          const direction = unit.team === "player" ? 1 : -1;
          const enemies = nextUnits.filter(
            (candidate) =>
              candidate.team !== unit.team &&
              candidate.hp > 0 &&
              Math.abs(candidate.y - unit.y) <= LANE_RANGE &&
              (unit.team === "player" ? candidate.x >= unit.x : candidate.x <= unit.x),
          );
          const target = enemies.sort((a, b) => Math.abs(a.x - unit.x) - Math.abs(b.x - unit.x))[0];

          if (target && Math.abs(target.x - unit.x) <= ATTACK_RANGE) {
            unit.state = "attacking";
            if (now - unit.lastAttackAt >= ATTACK_COOLDOWN_MS) {
              target.hp -= unit.damage;
              unit.lastAttackAt = now;
            }
            continue;
          }

          const baseX = unit.team === "player" ? 94 : 6;
          if (Math.abs(baseX - unit.x) <= ATTACK_RANGE) {
            unit.state = "attacking";
            if (now - unit.lastAttackAt >= ATTACK_COOLDOWN_MS) {
              if (unit.team === "player") nextBases.bot -= unit.damage;
              else nextBases.player -= unit.damage;
              unit.lastAttackAt = now;
            }
            continue;
          }

          unit.state = "moving";
          unit.x = clamp(unit.x + direction * unit.speed * deltaSeconds, 6, 94);
        }

        nextBases.player = clamp(nextBases.player, 0, BASE_HP);
        nextBases.bot = clamp(nextBases.bot, 0, BASE_HP);
        syncBases(nextBases);
        syncUnits(nextUnits.filter((unit) => unit.hp > 0));

        if (nextBases.bot <= 0) {
          syncResult("won");
          setNotice("فزت");
        } else if (nextBases.player <= 0) {
          syncResult("lost");
          setNotice("خسرت");
        }
      }

      rafRef.current = window.requestAnimationFrame(frame);
    }

    rafRef.current = window.requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [spawnUnit, syncBases, syncEnergy, syncResult, syncUnits]);

  const energyBlocks = Array.from({ length: MAX_ENERGY }, (_, index) => index < Math.floor(energy));

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="لعبة حلبة الأبطال">
      <div className="relative overflow-hidden rounded-lg border border-[#D8C8B2] bg-[#F7EFE3] shadow-[0_18px_50px_rgba(49,25,18,0.10)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#D8C8B2] bg-white/80 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-[#7A4D2A]">جولة محلية ضد البوت</p>
            <h2 className="text-xl font-black text-[#24140F]">{resultLabel(result)}</h2>
          </div>
          <button
            type="button"
            onClick={resetGame}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#D8C8B2] bg-[#FFFDF8] px-3 text-sm font-black text-[#4A281D] transition hover:bg-[#FFF7E3] active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
            إعادة الجولة
          </button>
        </div>

        <div className="relative h-[520px] min-h-[420px] max-h-[72vh] overflow-hidden bg-[#F2E2CD] sm:h-[590px]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(74,40,29,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(32,91,84,0.09)_1px,transparent_1px)] bg-[size:36px_36px]" />
          <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-[#205B54]/25" />
          <div className="absolute left-[9%] top-[8%] bottom-[8%] w-1 rounded-full bg-[#6E1E3B]/15" />
          <div className="absolute right-[9%] top-[8%] bottom-[8%] w-1 rounded-full bg-[#205B54]/15" />

          <div className="absolute left-3 top-1/2 z-10 w-[72px] -translate-y-1/2 rounded-lg border border-[#6E1E3B]/30 bg-[#FFFDF8] p-2 text-center shadow-sm">
            <div className="text-2xl">🏪</div>
            <p className="mt-1 text-[11px] font-black text-[#6E1E3B]">قاعدتك</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F0D8D8]">
              <div className="h-full bg-[#6E1E3B]" style={{ width: basePercent(bases.player) }} />
            </div>
            <p className="mt-1 text-[11px] font-black text-[#24140F]">{bases.player}</p>
          </div>

          <div className="absolute right-3 top-1/2 z-10 w-[72px] -translate-y-1/2 rounded-lg border border-[#205B54]/30 bg-[#FFFDF8] p-2 text-center shadow-sm">
            <div className="text-2xl">☕</div>
            <p className="mt-1 text-[11px] font-black text-[#205B54]">قاعدة البوت</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#D5E6E1]">
              <div className="h-full bg-[#205B54]" style={{ width: basePercent(bases.bot) }} />
            </div>
            <p className="mt-1 text-[11px] font-black text-[#24140F]">{bases.bot}</p>
          </div>

          {LANES.map((lane) => (
            <div
              key={lane}
              className="absolute left-[12%] right-[12%] h-10 -translate-y-1/2 rounded-lg border border-white/70 bg-white/25"
              style={{ top: `${lane}%` }}
            />
          ))}

          {units.map((unit) => (
            <div
              key={unit.id}
              className={`absolute z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border bg-white text-center shadow-md transition-transform ${
                unit.team === "player" ? "border-[#6E1E3B]/30" : "border-[#205B54]/30"
              } ${unit.state === "attacking" ? "scale-105" : ""}`}
              style={{ left: `${unit.x}%`, top: `${unit.y}%` }}
              title={unit.name}
            >
              <span className="text-2xl leading-none">{unit.icon}</span>
              <span
                className={`absolute -bottom-2 left-1/2 h-1.5 w-12 -translate-x-1/2 overflow-hidden rounded-full ${
                  unit.team === "player" ? "bg-[#F0D8D8]" : "bg-[#D5E6E1]"
                }`}
              >
                <span
                  className={`block h-full ${unit.team === "player" ? "bg-[#6E1E3B]" : "bg-[#205B54]"}`}
                  style={{ width: `${clamp((unit.hp / unit.maxHp) * 100, 0, 100)}%` }}
                />
              </span>
            </div>
          ))}

          {result !== "playing" ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#24140F]/55 px-4">
              <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center shadow-xl">
                <p className="text-3xl font-black text-[#24140F]">{resultLabel(result)}</p>
                <button
                  type="button"
                  onClick={resetGame}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#205B54] px-4 text-sm font-black text-white transition active:scale-95"
                >
                  <RotateCcw className="h-4 w-4" />
                  إعادة الجولة
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-[#D8C8B2] bg-white p-4 shadow-[0_12px_30px_rgba(49,25,18,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#7A4D2A]">الطاقة</p>
              <p className="text-2xl font-black text-[#24140F]">{Math.floor(energy)} / {MAX_ENERGY}</p>
            </div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[#F2E2CD] text-[#7A4D2A]">
              <Zap className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 grid grid-cols-10 gap-1" aria-hidden="true">
            {energyBlocks.map((filled, index) => (
              <span
                key={index}
                className={`h-3 rounded-sm ${filled ? "bg-[#D9A33F]" : "bg-[#EFE5D8]"}`}
              />
            ))}
          </div>
          <p className="mt-3 text-sm font-bold leading-6 text-[#5C3B2B]">{notice}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {CARDS.map((card) => {
            const canPlay = result === "playing" && energy >= card.cost;
            return (
              <button
                key={card.kind}
                type="button"
                onClick={() => playCard(card)}
                disabled={result !== "playing"}
                className={`min-h-[116px] rounded-lg border p-3 text-right transition active:scale-[0.98] disabled:cursor-not-allowed ${
                  canPlay
                    ? "border-[#D9A33F]/55 bg-[#FFF7E3] text-[#24140F] hover:bg-[#FFEEC4]"
                    : "border-[#D8C8B2] bg-white text-[#6F625A] opacity-85"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#7A4D2A]">
                      <CardIcon kind={card.kind} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black">{card.name}</span>
                      <span className="mt-0.5 block text-xs font-bold text-[#6F625A]">
                        HP {card.hp} · ضرر {card.damage}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-[#205B54] px-2 py-1 text-xs font-black text-white">
                    {card.cost}
                  </span>
                </span>
                <span className="mt-3 block text-xs font-bold leading-5 text-[#5C3B2B]">
                  {card.shortName} يتحرك تلقائيًا ويهاجم أقرب خصم في نفس الممر.
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </section>
  );
}
