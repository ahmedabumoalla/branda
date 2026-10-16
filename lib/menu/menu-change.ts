export const MENU_CHANGE_KEY = "branda-menu-change";

export function notifyMenuChanged(slug?: string) {
  if (!slug) return;
  try {
    localStorage.setItem(MENU_CHANGE_KEY, JSON.stringify({ slug, at: Date.now() }));
  } catch { /* Storage restrictions must not prevent a successful product save. */ }
}
