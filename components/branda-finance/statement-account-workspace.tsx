"use client";

import { useState } from "react";
import { StatementAccountTable } from "@/components/branda-finance/statement-account-table";
import { StatementAccountToolbar } from "@/components/branda-finance/statement-account-toolbar";
import {
  defaultStatementAccountColumnState,
  type StatementAccountColumnId,
  type StatementAccountColumnState,
  type StatementAccountView,
} from "@/lib/branda-finance/statement-account";

type StatementAccountWorkspaceProps = {
  view: StatementAccountView;
};

function freshDefaultColumnState(): StatementAccountColumnState[] {
  return defaultStatementAccountColumnState.map((column) => ({ ...column }));
}

export function StatementAccountWorkspace({ view }: StatementAccountWorkspaceProps) {
  const [columnState, setColumnState] =
    useState<StatementAccountColumnState[]>(freshDefaultColumnState);

  function toggleColumn(columnId: StatementAccountColumnId) {
    setColumnState((current) =>
      current.map((column) =>
        column.id === columnId ? { ...column, visible: !column.visible } : column,
      ),
    );
  }

  function moveColumn(columnId: StatementAccountColumnId, direction: "up" | "down") {
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
      <StatementAccountToolbar
        columnState={columnState}
        onToggleColumn={toggleColumn}
        onMoveColumn={moveColumn}
        onResetColumns={resetColumns}
      />
      <StatementAccountTable columnState={columnState} view={view} />
    </>
  );
}
