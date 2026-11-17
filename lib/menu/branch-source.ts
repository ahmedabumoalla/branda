export type MenuSourceBranch = {
  id: string;
  active: boolean;
  menu_slug: string | null;
  uses_brand_menu: boolean;
  is_brand_menu_root: boolean;
  deleted_at?: string | null;
};

/** Rows must already be scoped to one authorized brand. Never choose a new first branch as the brand menu. */
export function resolveBranchMenuSource<T extends MenuSourceBranch>(rows: readonly T[], selectedId: string | null = null, publicOnly = false): { branch: T | null; sourceBranchId: string | null } | null {
  const visible = (row: T) => !row.deleted_at && (!publicOnly || (row.active && Boolean(row.menu_slug)));
  const selected = selectedId ? rows.find(row => row.id === selectedId && visible(row)) : null;
  if (selectedId && !selected) return null;
  if (selected && !selected.uses_brand_menu) return { branch: selected, sourceBranchId: selected.id };
  const roots = rows.filter(row => row.is_brand_menu_root);
  if (roots.length > 1) return null;
  const root = roots[0] ?? null;
  if (root && (!visible(root) || root.uses_brand_menu)) return null;
  return { branch: selected ?? root, sourceBranchId: root?.id ?? null };
}
