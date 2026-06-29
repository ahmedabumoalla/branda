"use client";

import { useState } from "react";
import { GeneralLedgerTable } from "@/components/branda-finance/general-ledger-table";
import { GeneralLedgerToolbar } from "@/components/branda-finance/general-ledger-toolbar";
import {
  defaultGeneralLedgerColumnState,
  type GeneralLedgerColumnId,
  type GeneralLedgerColumnState,
} from "@/lib/branda-finance/general-ledger";

function freshDefaultColumnState(): GeneralLedgerColumnState[] {
  return defaultGeneralLedgerColumnState.map((column) => ({ ...column }));
}

export function GeneralLedgerWorkspace() {
  const [columnState, setColumnState] =
    useState<GeneralLedgerColumnState[]>(freshDefaultColumnState);

  function toggleColumn(columnId: GeneralLedgerColumnId) {
    setColumnState((current) =>
      current.map((column) =>
        column.id === columnId ? { ...column, visible: !column.visible } : column,
      ),
    );
  }

  function moveColumn(columnId: GeneralLedgerColumnId, direction: "up" | "down") {
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
      <GeneralLedgerToolbar
        columnState={columnState}
        onToggleColumn={toggleColumn}
        onMoveColumn={moveColumn}
        onResetColumns={resetColumns}
      />
      <GeneralLedgerTable columnState={columnState} />
    </>
  );
}
