import { CarFront, Store } from "lucide-react";
import { DashboardNavigationLink } from "@/components/dashboard/dashboard-navigation-link";

type Branch = { id: string; name: string; slug: string };

export function MenuBranchSwitcher({ branches, currentId, busy = false, onSwitch }: { branches: readonly Branch[]; currentId?: string | null; busy?: boolean; onSwitch?: (branch: Branch) => void }) {
  if (branches.length < 2) return null;
  return <nav aria-label="التنقل بين منيوهات الفروع" className="mb-5 flex flex-wrap gap-3">{branches.map(branch => {
    const active = currentId === branch.id;
    const Icon = /drive|درايف/i.test(`${branch.slug} ${branch.name}`) ? CarFront : Store;
    return <DashboardNavigationLink key={branch.id} href={`/dashboard/menu?branch=${encodeURIComponent(branch.id)}`} aria-current={active ? "page" : undefined} aria-disabled={busy || undefined} prefetch={busy ? false : undefined} onClick={event => { if (busy || active) event.preventDefault(); }} onNavigate={event => { if (busy || active) { event.preventDefault(); return; } if (onSwitch) { event.preventDefault(); onSwitch(branch); } }} className={`flex min-h-12 flex-1 items-center justify-center gap-3 rounded-2xl border px-5 py-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6D3B25] sm:flex-none ${active ? "border-[#6D3B25] bg-[#6D3B25] text-white" : "border-[#E5D8CD] bg-white text-[#4A281D] hover:bg-[#F5EDE5]"} ${busy ? "cursor-wait opacity-60" : ""}`}>
      <Icon className="h-6 w-6 shrink-0" aria-hidden="true" /><span>{branch.name}</span>
    </DashboardNavigationLink>;
  })}</nav>;
}
