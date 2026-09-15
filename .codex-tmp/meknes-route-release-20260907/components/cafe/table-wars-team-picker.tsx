"use client";

import { useState, useTransition } from "react";
import { Shield, Swords } from "lucide-react";
import type { TableWarsTeam, TableWarsV2JoinActionResult, TableWarsV2Snapshot } from "@/lib/table-wars/v2-types";

type Props = {
  canJoinBlue: boolean;
  canJoinRed: boolean;
  onJoin: (team: TableWarsTeam) => Promise<TableWarsV2JoinActionResult>;
  onJoined: (snapshot: TableWarsV2Snapshot) => void;
};

export function TableWarsTeamPicker({ canJoinBlue, canJoinRed, onJoin, onJoined }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function join(team: TableWarsTeam) {
    setError(null);
    startTransition(() => {
      void onJoin(team)
        .then((result) => {
          if (!result.ok) {
            setError(result.message);
            return;
          }
          onJoined(result.snapshot);
        })
        .catch((joinError) => {
          setError(joinError instanceof Error ? joinError.message : "تعذر الانضمام للفريق.");
        });
    });
  }

  return (
    <section className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={!canJoinBlue || isPending}
        onClick={() => join("blue")}
        className="min-h-32 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-right transition hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-500 text-white">
          <Shield className="h-5 w-5" />
        </span>
        <span className="mt-3 block text-base font-black text-sky-950">الفريق الأزرق</span>
        <span className="mt-1 block text-xs font-bold leading-5 text-sky-800">
          مقعدان متاحان لكل جولة.
        </span>
      </button>

      <button
        type="button"
        disabled={!canJoinRed || isPending}
        onClick={() => join("red")}
        className="min-h-32 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-right transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-500 text-white">
          <Swords className="h-5 w-5" />
        </span>
        <span className="mt-3 block text-base font-black text-rose-950">الفريق الأحمر</span>
        <span className="mt-1 block text-xs font-bold leading-5 text-rose-800">
          مقعدان متاحان لكل جولة.
        </span>
      </button>

      {error ? (
        <p className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
