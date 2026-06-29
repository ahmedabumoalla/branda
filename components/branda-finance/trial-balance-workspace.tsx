"use client";

import { useState } from "react";
import { TrialBalanceTable } from "@/components/branda-finance/trial-balance-table";
import { TrialBalanceToolbar } from "@/components/branda-finance/trial-balance-toolbar";
import {
  defaultTrialBalanceColumnState,
  type TrialBalanceColumnId,
  type TrialBalanceColumnState,
} from "@/lib/branda-finance/trial-balance";

function freshDefaultColumnState(): TrialBalanceColumnState[] {
  return defaultTrialBalanceColumnState.map((column) => ({ ...column }));
}

export function TrialBalanceWorkspace() {
  const [columnState, setColumnState] = useState<TrialBalanceColumnState[]>(freshDefaultColumnState);

  function toggleColumn(columnId: TrialBalanceColumnId) {
    setColumnState((current) =>
      current.map((column) =>
        column.id === columnId ? { ...column, visible: !column.visible } : column,
      ),
    );
  }

  function moveColumn(columnId: TrialBalanceColumnId, direction: "up" | "down") {
    setColumnState((current) => {
      const index = current.findIndex((column) => column.id === columnId);
      if (index < 0) return current;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  }

  function resetColumns() {
    setColumnState(freshDefaultColumnState());
  }

  return (
    <>
      <TrialBalanceToolbar
        columnState={columnState}
        onToggleColumn={toggleColumn}
        onMoveColumn={moveColumn}
        onResetColumns={resetColumns}
      />
      <TrialBalanceTable columnState={columnState} />
    </>
  );
}
