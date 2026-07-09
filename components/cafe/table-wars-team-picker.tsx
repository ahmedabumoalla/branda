"use client";

import { useState, useTransition } from "react";
import { Shield, Swords } from "lucide-react";
import type { TableWarsTeam, TableWarsV2JoinResult, TableWarsV2Snapshot } from "@/lib/table-wars/v2-types";

type Props = {
  canJoinBlue: boolean;
  canJoinRed: boolean;
  onJoin: (team: TableWarsTeam) => Promise<TableWarsV2JoinResult>;
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
          onJoined(result.snapshot);
        })
        .catch((joinError) => {
          setError(joinError instanceof Error ? joinError.message : "تعذر الانضمام للفريق.");
        });
    });
  }

  return (
    <section className="grid gap-3 md:grid-cols-2">
      <button
        type="button"
        disabled={!canJoinBlue || isPending}
        onClick={() => join("blue")}
        className="min-h-40 rounded-lg border border-sky-200 bg-sky-50 p-5 text-right transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-500 text-white">
          <Shield className="h-5 w-5" />
        </span>
        <span className="mt-4 block text-xl font-black text-sky-950">الفريق الأزرق</span>
        <span className="mt-2 block text-sm font-bold leading-7 text-sky-800">
          انضم إلى الأزرق وسيتم تعيين قلعتك الأساسية داخل الجولة.
        </span>
      </button>

      <button
        type="button"
        disabled={!canJoinRed || isPending}
        onClick={() => join("red")}
        className="min-h-40 rounded-lg border border-rose-200 bg-rose-50 p-5 text-right transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-500 text-white">
          <Swords className="h-5 w-5" />
        </span>
        <span className="mt-4 block text-xl font-black text-rose-950">الفريق الأحمر</span>
        <span className="mt-2 block text-sm font-bold leading-7 text-rose-800">
          انضم إلى الأحمر وسيتم تعيين قلعتك الأساسية داخل الجولة.
        </span>
      </button>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700 md:col-span-2">
          {error}
        </p>
      ) : null}
    </section>
  );
}
