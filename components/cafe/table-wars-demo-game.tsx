"use client";

import { useEffect, useMemo, useState } from "react";
import { Castle, Shield, Swords } from "lucide-react";

type DemoTable = {
  id: string;
  label: string;
  soldiers: number;
  owner: "player" | "enemy" | "neutral";
};

const initialTables: DemoTable[] = [
  { id: "player", label: "طاولتك", soldiers: 24, owner: "player" },
  { id: "enemy", label: "طاولة خصم", soldiers: 18, owner: "enemy" },
  { id: "neutral", label: "طاولة محايدة", soldiers: 12, owner: "neutral" },
  { id: "strong", label: "طاولة قوية", soldiers: 34, owner: "enemy" },
];

function ownerLabel(owner: DemoTable["owner"]) {
  if (owner === "player") return "تحت سيطرتك";
  if (owner === "enemy") return "خصم";
  return "محايدة";
}

function ownerClass(owner: DemoTable["owner"]) {
  if (owner === "player") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (owner === "enemy") return "border-red-200 bg-red-50 text-red-800";
  return "border-[#E7D7C6] bg-[#FCF8F3] text-[#6B3A25]";
}

export function TableWarsDemoGame() {
  const [tables, setTables] = useState(initialTables);
  const [targetId, setTargetId] = useState("enemy");
  const [message, setMessage] = useState("اختر طاولة وابدأ هجومًا تجريبيًا.");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTables((current) =>
        current.map((table) =>
          table.id === "player" ? { ...table, soldiers: table.soldiers + 2 } : table,
        ),
      );
    }, 2000);

    return () => window.clearInterval(timer);
  }, []);

  const player = tables.find((table) => table.id === "player") ?? tables[0];
  const target = tables.find((table) => table.id === targetId) ?? tables[1];
  const attackDisabled = !target || target.id === "player";

  const controlledCount = useMemo(
    () => tables.filter((table) => table.owner === "player").length,
    [tables],
  );

  function attack() {
    if (!target || target.id === "player") return;

    if (player.soldiers > target.soldiers) {
      const remaining = Math.max(8, player.soldiers - target.soldiers);
      setTables((current) =>
        current.map((table) => {
          if (table.id === "player") return { ...table, soldiers: remaining };
          if (table.id === target.id) {
            return {
              ...table,
              owner: "player",
              soldiers: Math.max(6, Math.floor(remaining / 2)),
            };
          }
          return table;
        }),
      );
      setMessage("تمت السيطرة على الطاولة");
      return;
    }

    setTables((current) =>
      current.map((table) =>
        table.id === "player"
          ? { ...table, soldiers: Math.max(6, Math.floor(table.soldiers / 2)) }
          : table,
      ),
    );
    setMessage("الهجوم فشل");
  }

  return (
    <section className="rounded-3xl border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
            تجربة تجريبية
          </span>
          <h2 className="mt-3 text-2xl font-black text-[#311912]">معركة الطاولات</h2>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
            اختر هدفًا، ثم اهجم عندما يكون جنود طاولتك أكثر من جنود الهدف.
          </p>
        </div>
        <div className="rounded-2xl bg-[#FCF8F3] p-4 text-center">
          <p className="text-xs font-black text-[#806A5E]">طاولات تحت سيطرتك</p>
          <p className="mt-1 text-3xl font-black text-[#311912]">{controlledCount}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {tables.map((table) => {
          const selected = targetId === table.id;
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => setTargetId(table.id)}
              disabled={table.id === "player"}
              className={`min-h-[132px] rounded-2xl border p-4 text-right transition active:scale-[0.98] ${
                selected
                  ? "border-[#D9A33F] bg-[#FFF7E3]"
                  : "border-[#E7D7C6] bg-[#FCF8F3]"
              } ${table.id === "player" ? "cursor-default" : "hover:border-[#D9A33F]"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${ownerClass(table.owner)}`}>
                  {ownerLabel(table.owner)}
                </span>
                <Castle className="h-6 w-6 text-[#6B3A25]" />
              </div>
              <p className="mt-4 text-lg font-black text-[#311912]">{table.label}</p>
              <p className="mt-1 text-sm font-bold text-[#806A5E]">{table.soldiers} جندي</p>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-[#F2E7D9] bg-[#FCF8F3] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6B3A25]">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-black text-[#311912]">{message}</p>
            <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">
              النقاط والجوائز ستفعّل لاحقًا بعد اعتماد نظام اللعب.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={attack}
          disabled={attackDisabled}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#311912] px-6 text-sm font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#311912]/20 disabled:text-[#6B3A25]"
        >
          <Swords className="h-4 w-4" />
          هجوم
        </button>
      </div>
    </section>
  );
}
