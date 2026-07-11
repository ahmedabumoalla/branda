"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { RotateCcw, Zap } from "lucide-react";

type Team = "player" | "bot";
type UnitState = "moving" | "attacking" | "defeated";
type UnitKind = "swift_waiter" | "strong_chef" | "branch_guard";
type GameResult = "playing" | "won" | "lost";

type CardDef = {
  kind: UnitKind;
  name: string;
  shortName: string;
  hp: number;
  speed: number;
  damage: number;
  cost: number;
};

type Unit = {
  id: string;
  kind: UnitKind;
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  team: Team;
  x: number;
  y: number;
  state: UnitState;
  lastAttackAt: number;
  damagedAt: number;
  defeatedAt: number | null;
  hitId: number;
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
const DEFEAT_ANIMATION_MS = 420;
const PLAYER_COLOR = "#7C2948";
const BOT_COLOR = "#14645E";

const CARDS: CardDef[] = [
  {
    kind: "swift_waiter",
    name: "النادل السريع",
    shortName: "النادل",
    hp: 42,
    speed: 10.5,
    damage: 9,
    cost: 3,
  },
  {
    kind: "strong_chef",
    name: "الطاهي القوي",
    shortName: "الطاهي",
    hp: 88,
    speed: 5.2,
    damage: 17,
    cost: 5,
  },
  {
    kind: "branch_guard",
    name: "حارس الفرع",
    shortName: "الحارس",
    hp: 112,
    speed: 4.4,
    damage: 11,
    cost: 4,
  },
];

function makeInitialBases(): Bases {
  return { player: BASE_HP, bot: BASE_HP };
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

function teamColor(team: Team) {
  return team === "player" ? PLAYER_COLOR : BOT_COLOR;
}

function applyDamage(target: Unit, damage: number, now: number) {
  if (target.hp <= 0) return;

  target.hp -= damage;
  target.damagedAt = now;
  target.hitId += 1;

  if (target.hp <= 0) {
    target.hp = 0;
    target.state = "defeated";
    target.defeatedAt = now;
  }
}

function CharacterFigure({
  kind,
  team = "player",
  state = "moving",
  compact = false,
}: {
  kind: UnitKind;
  team?: Team;
  state?: UnitState;
  compact?: boolean;
}) {
  const isAttacking = state === "attacking";

  return (
    <span
      className={`ba-character ${compact ? "ba-character-mini" : ""} ba-${kind} ba-${team} ba-${state}`}
      style={{ "--team": teamColor(team), "--face": team === "player" ? 1 : -1 } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ba-shadow" />
      <span className="ba-sprite">
        <span className="ba-figure">
          <span className="ba-leg ba-leg-left" />
          <span className="ba-leg ba-leg-right" />
          <span className="ba-body">
            <span className="ba-apron" />
            {kind === "branch_guard" ? <span className="ba-shield-mark" /> : null}
          </span>
          <span className="ba-arm ba-arm-left" />
          <span className="ba-arm ba-arm-right" />
          <span className="ba-head">
            <span className="ba-hair" />
            {kind === "strong_chef" ? (
              <span className="ba-chef-hat">
                <span />
                <span />
                <span />
              </span>
            ) : null}
            {kind === "branch_guard" ? <span className="ba-cap" /> : null}
            {kind === "swift_waiter" ? <span className="ba-bowtie" /> : null}
          </span>
          <Accessory kind={kind} active={isAttacking} />
        </span>
      </span>
    </span>
  );
}

function Accessory({ kind, active }: { kind: UnitKind; active: boolean }) {
  if (kind === "swift_waiter") {
    return (
      <span className={`ba-accessory ba-tray ${active ? "ba-accessory-active" : ""}`}>
        <span className="ba-tray-plate" />
        <span className="ba-cup" />
      </span>
    );
  }

  if (kind === "strong_chef") {
    return (
      <span className={`ba-accessory ba-pan ${active ? "ba-accessory-active" : ""}`}>
        <span className="ba-pan-head" />
        <span className="ba-pan-handle" />
      </span>
    );
  }

  return (
    <span className={`ba-accessory ba-badge-shield ${active ? "ba-accessory-active" : ""}`}>
      <svg viewBox="0 0 30 34" role="img" aria-label="">
        <path d="M15 2 27 7v9c0 8-5 13-12 16C8 29 3 24 3 16V7l12-5Z" />
        <path d="M15 8v17M8 14h14" />
      </svg>
    </span>
  );
}

function ArenaUnit({ unit }: { unit: Unit }) {
  const hpPercent = `${clamp((unit.hp / unit.maxHp) * 100, 0, 100)}%`;

  return (
    <div
      className={`ba-unit ba-unit-${unit.team} ${unit.state === "defeated" ? "ba-unit-defeated" : ""}`}
      style={
        {
          left: `${unit.x}%`,
          top: `${unit.y}%`,
          "--hp": hpPercent,
          "--team": teamColor(unit.team),
        } as CSSProperties
      }
      title={unit.name}
    >
      <CharacterFigure kind={unit.kind} team={unit.team} state={unit.state} />
      <span className="ba-hp-track">
        <span className="ba-hp-fill" />
      </span>
      {unit.state === "attacking" ? <span className="ba-attack-ring" /> : null}
      {unit.hitId > 0 ? <span key={unit.hitId} className="ba-hit-flash" /> : null}
    </div>
  );
}

function CounterBase({ team, hp }: { team: Team; hp: number }) {
  const isPlayer = team === "player";
  const color = teamColor(team);

  return (
    <div
      className={`ba-base ${isPlayer ? "ba-base-player" : "ba-base-bot"}`}
      style={{ "--team": color } as CSSProperties}
    >
      <div className="ba-base-canopy">
        <span />
        <span />
        <span />
      </div>
      <div className="ba-base-counter">
        <span className="ba-base-machine" />
        <span className="ba-base-cups" />
      </div>
      <p className="ba-base-label">{isPlayer ? "كاونترك" : "كاونتر البوت"}</p>
      <div className="ba-base-health">
        <span style={{ width: basePercent(hp) }} />
      </div>
      <p className="ba-base-hp">{hp}</p>
    </div>
  );
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
        hp: card.hp,
        maxHp: card.hp,
        speed: card.speed,
        damage: card.damage,
        team,
        x: team === "player" ? 14 : 86,
        y: lane,
        state: "moving",
        lastAttackAt: 0,
        damagedAt: 0,
        defeatedAt: null,
        hitId: 0,
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
        const nextUnits = unitsRef.current.map((unit) => ({ ...unit }));
        const activeUnits = nextUnits.filter((unit) => unit.hp > 0);

        for (const unit of activeUnits) {
          if (unit.hp <= 0) continue;

          const direction = unit.team === "player" ? 1 : -1;
          const enemies = activeUnits.filter(
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
              applyDamage(target, unit.damage, now);
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
        syncUnits(
          nextUnits.filter(
            (unit) => unit.hp > 0 || (unit.defeatedAt !== null && now - unit.defeatedAt < DEFEAT_ANIMATION_MS),
          ),
        );

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

  const energyPercent = `${(energy / MAX_ENERGY) * 100}%`;

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_288px]" aria-label="لعبة حلبة الأبطال">
      <div className="overflow-hidden rounded-lg border border-[#CEB89C] bg-[#FFF9EF] shadow-[0_22px_55px_rgba(41,24,17,0.14)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#E1CCAD] bg-[#FFFDF7]/95 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-[#7A4D2A]">جولة محلية ضد البوت</p>
            <h2 className="text-lg font-black text-[#24140F] sm:text-xl">{resultLabel(result)}</h2>
          </div>
          <button
            type="button"
            onClick={resetGame}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#CEB89C] bg-white px-3 text-xs font-black text-[#4A281D] shadow-sm transition hover:bg-[#FFF3D6] active:scale-95 sm:text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            إعادة الجولة
          </button>
        </div>

        <div className="ba-arena relative h-[430px] min-h-[400px] overflow-hidden sm:h-[540px] lg:h-[590px]">
          <div className="ba-floor" />
          <div className="ba-center-line" />
          <div className="ba-side-line ba-side-line-player" />
          <div className="ba-side-line ba-side-line-bot" />

          {LANES.map((lane) => (
            <div key={lane} className="ba-lane" style={{ top: `${lane}%` }}>
              <span />
            </div>
          ))}

          <CounterBase team="player" hp={bases.player} />
          <CounterBase team="bot" hp={bases.bot} />

          {units.map((unit) => (
            <ArenaUnit key={unit.id} unit={unit} />
          ))}

          {result !== "playing" ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#24140F]/58 px-4 backdrop-blur-[2px]">
              <div className="w-full max-w-xs rounded-lg bg-white p-5 text-center shadow-xl">
                <p className="text-3xl font-black text-[#24140F]">{resultLabel(result)}</p>
                <button
                  type="button"
                  onClick={resetGame}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#14645E] px-4 text-sm font-black text-white transition active:scale-95"
                >
                  <RotateCcw className="h-4 w-4" />
                  إعادة الجولة
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="grid gap-3 lg:flex lg:flex-col">
        <div className="rounded-lg border border-[#CEB89C] bg-white p-3 shadow-[0_12px_30px_rgba(49,25,18,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black text-[#7A4D2A]">الطاقة</p>
              <p className="text-xl font-black text-[#24140F]">
                {Math.floor(energy)} / {MAX_ENERGY}
              </p>
            </div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF1C8] text-[#8A5B00]">
              <Zap className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#EFE3D1] shadow-inner" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#F0B33F,#E06D3C,#14645E)] transition-[width] duration-200"
              style={{ width: energyPercent }}
            />
          </div>
          <p className="mt-3 min-h-10 text-sm font-bold leading-5 text-[#5C3B2B]">{notice}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {CARDS.map((card) => {
            const canPlay = result === "playing" && energy >= card.cost;
            return (
              <button
                key={card.kind}
                type="button"
                onClick={() => playCard(card)}
                disabled={result !== "playing"}
                className={`group min-h-[92px] rounded-lg border p-2.5 text-right shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed ${
                  canPlay
                    ? "border-[#D69C38]/70 bg-[#FFF8E8] text-[#24140F] hover:border-[#B9712D] hover:bg-[#FFF0CC]"
                    : "border-[#D9CCBA] bg-white text-[#6F625A] opacity-80"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F8EAD5] shadow-inner">
                      <CharacterFigure kind={card.kind} compact />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{card.name}</span>
                      <span className="mt-1 block text-[11px] font-bold text-[#6F625A]">
                        HP {card.hp} · ضرر {card.damage}
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-[#14645E] px-2 text-xs font-black text-white shadow-sm">
                    {card.cost}
                  </span>
                </span>
                <span className="mt-2 flex items-center justify-between gap-2 text-[11px] font-black text-[#7A4D2A]">
                  <span>{card.shortName}</span>
                  <span>سرعة {card.speed}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <style>{`
        .ba-arena {
          background:
            radial-gradient(circle at 50% 16%, rgba(255, 255, 255, 0.58), transparent 34%),
            linear-gradient(180deg, #fff7e8 0%, #ecd4b5 60%, #d4b28a 100%);
        }

        .ba-floor {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(36, 20, 15, 0.08) 1px, transparent 1px),
            linear-gradient(0deg, rgba(20, 100, 94, 0.08) 1px, transparent 1px),
            radial-gradient(ellipse at center, rgba(255, 250, 237, 0.7), rgba(194, 145, 91, 0.24));
          background-size: 44px 44px, 44px 44px, 100% 100%;
        }

        .ba-floor::after {
          content: "";
          position: absolute;
          inset: 8% 11%;
          border-radius: 26px;
          border: 1px solid rgba(255, 255, 255, 0.6);
          box-shadow:
            inset 0 30px 55px rgba(255, 255, 255, 0.22),
            inset 0 -24px 45px rgba(84, 48, 31, 0.16);
          transform: perspective(720px) rotateX(4deg);
        }

        .ba-center-line {
          position: absolute;
          inset-block: 8%;
          left: 50%;
          width: 6px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: linear-gradient(180deg, transparent, rgba(122, 77, 42, 0.28), transparent);
          box-shadow: 0 0 24px rgba(255, 255, 255, 0.48);
        }

        .ba-side-line {
          position: absolute;
          inset-block: 10%;
          width: 4px;
          border-radius: 999px;
          opacity: 0.35;
        }

        .ba-side-line-player {
          left: 12%;
          background: #7c2948;
        }

        .ba-side-line-bot {
          right: 12%;
          background: #14645e;
        }

        .ba-lane {
          position: absolute;
          left: 13%;
          right: 13%;
          height: 54px;
          transform: translateY(-50%) perspective(760px) rotateX(8deg);
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.24));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.78),
            inset 0 -18px 30px rgba(96, 56, 35, 0.08);
        }

        .ba-lane span {
          position: absolute;
          inset: 50% 18px auto;
          height: 2px;
          transform: translateY(-50%);
          background: linear-gradient(90deg, transparent, rgba(122, 77, 42, 0.24), transparent);
        }

        .ba-base {
          position: absolute;
          top: 50%;
          z-index: 12;
          width: 86px;
          transform: translateY(-50%);
          text-align: center;
          color: #24140f;
        }

        .ba-base-player {
          left: 10px;
        }

        .ba-base-bot {
          right: 10px;
        }

        .ba-base-canopy {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          height: 20px;
          overflow: hidden;
          border-radius: 10px 10px 3px 3px;
          border: 1px solid color-mix(in srgb, var(--team) 55%, white);
          background: #fff8e7;
          box-shadow: 0 10px 18px rgba(42, 24, 16, 0.14);
        }

        .ba-base-canopy span:nth-child(odd) {
          background: var(--team);
        }

        .ba-base-canopy span:nth-child(even) {
          background: #fff2cf;
        }

        .ba-base-counter {
          position: relative;
          height: 58px;
          margin-inline: 5px;
          border-radius: 4px 4px 12px 12px;
          border: 1px solid rgba(74, 40, 29, 0.16);
          background: linear-gradient(180deg, #fffdf7, #d9b88d);
          box-shadow:
            0 14px 24px rgba(42, 24, 16, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.85);
        }

        .ba-base-machine {
          position: absolute;
          left: 15px;
          bottom: 12px;
          width: 26px;
          height: 26px;
          border-radius: 6px 6px 4px 4px;
          background: linear-gradient(180deg, #364b4d, #182a2b);
        }

        .ba-base-machine::after {
          content: "";
          position: absolute;
          right: -10px;
          top: 9px;
          width: 13px;
          height: 4px;
          border-radius: 999px;
          background: #182a2b;
        }

        .ba-base-cups {
          position: absolute;
          right: 14px;
          bottom: 13px;
          width: 18px;
          height: 18px;
          border-radius: 3px 3px 7px 7px;
          border: 2px solid var(--team);
          background: rgba(255, 255, 255, 0.8);
        }

        .ba-base-label,
        .ba-base-hp {
          margin: 4px 0 0;
          font-size: 11px;
          font-weight: 900;
        }

        .ba-base-label {
          color: var(--team);
        }

        .ba-base-health {
          height: 7px;
          margin-top: 5px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.68);
          box-shadow: inset 0 0 0 1px rgba(74, 40, 29, 0.09);
        }

        .ba-base-health span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: var(--team);
          transition: width 180ms ease;
        }

        .ba-unit {
          position: absolute;
          z-index: 20;
          width: 70px;
          height: 76px;
          transform: translate(-50%, -63%);
          pointer-events: none;
        }

        .ba-unit-defeated {
          animation: ba-defeat 420ms ease forwards;
        }

        .ba-character {
          position: relative;
          display: inline-block;
          width: 62px;
          height: 66px;
        }

        .ba-character-mini {
          width: 40px;
          height: 42px;
          transform: scale(0.76);
          transform-origin: center bottom;
        }

        .ba-shadow {
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 0;
          height: 10px;
          border-radius: 50%;
          background: rgba(43, 26, 17, 0.22);
          filter: blur(1px);
          animation: ba-shadow 760ms ease-in-out infinite;
        }

        .ba-sprite {
          position: absolute;
          inset: 0;
          animation: ba-bob 760ms ease-in-out infinite;
        }

        .ba-attacking .ba-sprite {
          animation: ba-strike 360ms ease-in-out infinite;
        }

        .ba-figure {
          position: absolute;
          left: 12px;
          bottom: 8px;
          width: 38px;
          height: 52px;
          transform: scaleX(var(--face));
          transform-origin: center bottom;
        }

        .ba-head {
          position: absolute;
          left: 10px;
          top: 3px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(180deg, #f1bd84, #c9784d);
          box-shadow: inset 0 -2px 0 rgba(80, 37, 24, 0.18);
        }

        .ba-hair {
          position: absolute;
          left: 2px;
          top: -1px;
          width: 14px;
          height: 7px;
          border-radius: 8px 8px 4px 4px;
          background: #38231d;
        }

        .ba-body {
          position: absolute;
          left: 7px;
          top: 20px;
          width: 24px;
          height: 25px;
          border-radius: 9px 9px 7px 7px;
          background: linear-gradient(180deg, #fffdf7 0 39%, var(--team) 40% 100%);
          box-shadow:
            inset 0 0 0 1px rgba(36, 20, 15, 0.12),
            0 8px 12px rgba(36, 20, 15, 0.14);
        }

        .ba-apron {
          position: absolute;
          left: 7px;
          top: 6px;
          width: 10px;
          height: 17px;
          border-radius: 0 0 5px 5px;
          background: rgba(255, 255, 255, 0.88);
        }

        .ba-swift_waiter .ba-body {
          background: linear-gradient(180deg, #fffdf7 0 35%, var(--team) 36% 100%);
        }

        .ba-strong_chef .ba-body {
          background: linear-gradient(180deg, #fffdf7 0 72%, #d64d34 73% 100%);
        }

        .ba-branch_guard .ba-body {
          background: linear-gradient(180deg, #3f5e64, var(--team));
        }

        .ba-shield-mark {
          position: absolute;
          left: 7px;
          top: 7px;
          width: 10px;
          height: 12px;
          clip-path: polygon(50% 0, 100% 20%, 88% 78%, 50% 100%, 12% 78%, 0 20%);
          background: #f6c45a;
        }

        .ba-arm,
        .ba-leg {
          position: absolute;
          background: #5c3430;
        }

        .ba-arm {
          top: 24px;
          width: 8px;
          height: 22px;
          border-radius: 999px;
          transform-origin: top center;
          animation: ba-arm-swing 760ms ease-in-out infinite;
        }

        .ba-arm-left {
          left: 2px;
        }

        .ba-arm-right {
          right: 2px;
          animation-delay: -380ms;
        }

        .ba-attacking .ba-arm-right {
          animation: ba-attack-arm 360ms ease-in-out infinite;
        }

        .ba-leg {
          bottom: 0;
          width: 8px;
          height: 17px;
          border-radius: 999px 999px 4px 4px;
          transform-origin: top center;
          animation: ba-step 760ms ease-in-out infinite;
        }

        .ba-leg-left {
          left: 9px;
        }

        .ba-leg-right {
          right: 9px;
          animation-delay: -380ms;
        }

        .ba-chef-hat {
          position: absolute;
          left: -3px;
          top: -11px;
          width: 24px;
          height: 14px;
        }

        .ba-chef-hat span {
          position: absolute;
          bottom: 0;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fffdf7;
          box-shadow: inset 0 -1px 0 rgba(36, 20, 15, 0.12);
        }

        .ba-chef-hat span:nth-child(1) {
          left: 0;
        }

        .ba-chef-hat span:nth-child(2) {
          left: 6px;
          top: -2px;
        }

        .ba-chef-hat span:nth-child(3) {
          right: 0;
        }

        .ba-cap {
          position: absolute;
          left: -2px;
          top: -5px;
          width: 22px;
          height: 9px;
          border-radius: 9px 9px 3px 3px;
          background: #20383a;
        }

        .ba-cap::after {
          content: "";
          position: absolute;
          right: -6px;
          bottom: 0;
          width: 10px;
          height: 4px;
          border-radius: 999px;
          background: #20383a;
        }

        .ba-bowtie {
          position: absolute;
          left: 6px;
          bottom: -6px;
          width: 7px;
          height: 5px;
          background: var(--team);
          clip-path: polygon(0 0, 50% 45%, 100% 0, 100% 100%, 50% 55%, 0 100%);
        }

        .ba-accessory {
          position: absolute;
          z-index: 2;
        }

        .ba-tray {
          right: -10px;
          top: 26px;
          width: 23px;
          height: 16px;
          transform-origin: left center;
        }

        .ba-tray-plate {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 24px;
          height: 5px;
          border-radius: 50%;
          background: #2e4042;
        }

        .ba-cup {
          position: absolute;
          left: 8px;
          top: 0;
          width: 8px;
          height: 10px;
          border-radius: 2px 2px 5px 5px;
          background: #fffdf7;
          border: 1px solid #2e4042;
        }

        .ba-pan {
          right: -13px;
          top: 28px;
          width: 28px;
          height: 15px;
          transform-origin: left center;
        }

        .ba-pan-head {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 17px;
          height: 12px;
          border-radius: 50%;
          background: #273234;
          box-shadow: inset 0 -2px 0 rgba(255, 255, 255, 0.16);
        }

        .ba-pan-handle {
          position: absolute;
          left: 0;
          bottom: 5px;
          width: 17px;
          height: 4px;
          border-radius: 999px;
          background: #273234;
        }

        .ba-badge-shield {
          right: -8px;
          top: 24px;
          width: 24px;
          height: 28px;
          transform-origin: left center;
        }

        .ba-badge-shield svg {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 4px 4px rgba(36, 20, 15, 0.18));
        }

        .ba-badge-shield path:first-child {
          fill: #f6c45a;
          stroke: #7a4d2a;
          stroke-width: 2;
        }

        .ba-badge-shield path:last-child {
          fill: none;
          stroke: #7a4d2a;
          stroke-linecap: round;
          stroke-width: 2;
        }

        .ba-accessory-active {
          animation: ba-accessory-strike 360ms ease-in-out infinite;
        }

        .ba-hp-track {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 0;
          height: 6px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.78);
          box-shadow: inset 0 0 0 1px rgba(36, 20, 15, 0.12);
        }

        .ba-hp-fill {
          display: block;
          width: var(--hp);
          height: 100%;
          border-radius: inherit;
          background: var(--team);
          transition: width 140ms ease;
        }

        .ba-attack-ring,
        .ba-hit-flash {
          position: absolute;
          pointer-events: none;
        }

        .ba-attack-ring {
          left: 44px;
          top: 20px;
          width: 26px;
          height: 26px;
          border: 2px solid rgba(246, 196, 90, 0.85);
          border-radius: 50%;
          animation: ba-impact 520ms ease-out infinite;
        }

        .ba-unit-bot .ba-attack-ring {
          left: 0;
        }

        .ba-hit-flash {
          inset: 6px 9px 10px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.72);
          mix-blend-mode: screen;
          animation: ba-hit 180ms ease-out forwards;
        }

        @keyframes ba-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        @keyframes ba-shadow {
          0%, 100% { transform: scaleX(1); opacity: 0.22; }
          50% { transform: scaleX(0.78); opacity: 0.15; }
        }

        @keyframes ba-arm-swing {
          0%, 100% { transform: rotate(-12deg); }
          50% { transform: rotate(18deg); }
        }

        @keyframes ba-step {
          0%, 100% { transform: rotate(12deg) translateY(0); }
          50% { transform: rotate(-14deg) translateY(2px); }
        }

        @keyframes ba-strike {
          0%, 100% { transform: translateY(0) translateX(0); }
          45% { transform: translateY(-2px) translateX(4px); }
        }

        @keyframes ba-attack-arm {
          0%, 100% { transform: rotate(8deg); }
          50% { transform: rotate(-58deg) translateY(-2px); }
        }

        @keyframes ba-accessory-strike {
          0%, 100% { transform: rotate(0deg) translateX(0); }
          50% { transform: rotate(-16deg) translateX(5px); }
        }

        @keyframes ba-impact {
          0% { transform: scale(0.25); opacity: 0.9; }
          100% { transform: scale(1.45); opacity: 0; }
        }

        @keyframes ba-hit {
          0% { opacity: 0.95; transform: scale(0.84); }
          100% { opacity: 0; transform: scale(1.22); }
        }

        @keyframes ba-defeat {
          0% { opacity: 1; transform: translate(-50%, -63%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -63%) scale(0.58); }
        }

        @media (max-width: 640px) {
          .ba-base {
            width: 74px;
          }

          .ba-base-player {
            left: 6px;
          }

          .ba-base-bot {
            right: 6px;
          }

          .ba-unit {
            width: 60px;
            height: 68px;
          }

          .ba-character:not(.ba-character-mini) {
            transform: scale(0.88);
            transform-origin: center bottom;
          }

          .ba-lane {
            left: 16%;
            right: 16%;
            height: 46px;
          }
        }
      `}</style>
    </section>
  );
}
