"use client";

import { DashboardNavigationLink as Link } from "./dashboard-navigation-link";
import { useId, useState, type MouseEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutDashboard, Monitor, WalletCards } from "lucide-react";
import { financeMenuGroups, financeMenuHref, resolveFinanceMenuEntry, resolveFinanceSection } from "@/components/finance/finance-navigation";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD77E]";
const row = `flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-right text-xs leading-5 hover:bg-white/[0.065] ${focus}`;

export function FinanceSidebarMenu({ slug, collapsed, onExpand, onNavigate }: {
  slug: string;
  collapsed: boolean;
  onExpand: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  const active = pathname === "/dashboard/finance";
  const inFinance = pathname.startsWith("/dashboard/finance");
  const section = pathname.startsWith("/dashboard/finance/ledger") ? "reports" : resolveFinanceSection(params.get("section"), true);
  const activeEntry = resolveFinanceMenuEntry(section, params.get("party"), params.get("view"));
  const routeKey = `${pathname}?${params}`;
  // A new route reveals its selected branch; the user can still collapse that branch.
  const [expansion, setExpansion] = useState({ route: routeKey, open: inFinance });
  const expanded = expansion.route === routeKey ? expansion.open : inFinance;
  const [groupExpansion, setGroupExpansion] = useState<Record<string, { route: string; open: boolean }>>({});
  const visible = expanded && !collapsed;

  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (active && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault();
      // Keep the loaded workspace and any pending operation intact.
      window.history.pushState(null, "", href);
    }
    onNavigate?.();
  }

  return <div>
    <button type="button" aria-label="برندة المالية" title={collapsed ? "برندة المالية" : undefined}
      aria-expanded={visible} aria-controls={`${id}-sections`}
      onClick={() => { if (collapsed) onExpand(); setExpansion({ route: routeKey, open: collapsed || !expanded }); }}
      className={`flex min-h-11 w-full items-center rounded-lg text-[13px] font-medium transition hover:bg-white/[0.065] ${focus} ${collapsed ? "justify-center" : "gap-2 px-3"} ${inFinance ? "bg-[#E5B85C]/10 text-[#FFD77E]" : "text-[#D8CEC5]"}`}>
      <WalletCards className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <><span className="flex-1 text-right">برندة المالية</span><ChevronDown className={`h-4 w-4 shrink-0 ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></>}
    </button>
    <div id={`${id}-sections`} hidden={!visible} className="mr-3 mt-1 space-y-0.5 border-r border-[#E5B85C]/20 pr-1.5">
      <Link href="/dashboard/finance?section=overview" scroll={false} prefetch={active ? false : undefined}
        onClick={event => navigate(event, "/dashboard/finance?section=overview")}
        aria-current={active && section === "overview" ? "page" : undefined}
        className={`${row} ${active && section === "overview" ? "bg-[#E5B85C]/10 text-[#FFD77E]" : "text-[#D8CEC5]"}`}>
        <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>نظرة عامة</span>
      </Link>
      {financeMenuGroups.map(({ id: groupId, label, icon: Icon, entries }) => {
        const selected = inFinance && entries.some(entry => entry.id === activeEntry);
        const saved = groupExpansion[groupId];
        const open = saved?.route === routeKey ? saved.open : selected;
        return <div key={groupId}>
          <button type="button" aria-expanded={open} aria-controls={`${id}-${groupId}`} className={`${row} ${selected ? "text-[#FFD77E]" : "text-[#D8CEC5]"}`}
            onClick={() => setGroupExpansion(value => ({ ...value, [groupId]: { route: routeKey, open: !open } }))}>
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1">{label}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          <div id={`${id}-${groupId}`} hidden={!open} className="mr-3 border-r border-white/10 pr-1.5">
            {entries.map(entry => {
              const href = financeMenuHref(entry);
              if (!href) return <div key={entry.id} aria-disabled="true" className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs leading-5 text-[#B8A99C]">
                <span className="min-w-0 flex-1">{entry.label}</span><span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px]">غير مفعّل</span>
              </div>;
              const current = inFinance && activeEntry === entry.id;
              return <Link key={entry.id} href={href} scroll={false} prefetch={active ? false : undefined}
                onClick={event => navigate(event, href)} aria-current={current ? "page" : undefined}
                className={`${row} ${current ? "bg-[#E5B85C]/10 text-[#FFD77E]" : "text-[#B8A99C]"}`}><span>{entry.label}</span></Link>;
            })}
            {groupId === "pos" && <Link href={`/finance/${encodeURIComponent(slug)}/pos`} onClick={onNavigate}
              className={`${row} text-[#FFD77E]`}><Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />فتح كاشير المالية</Link>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
