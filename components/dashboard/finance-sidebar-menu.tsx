"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Monitor, WalletCards } from "lucide-react";
import { financeSections, resolveFinanceSection } from "@/components/finance/finance-navigation";

export function FinanceSidebarMenu({ slug, collapsed, onExpand, onNavigate }: {
  slug: string;
  collapsed: boolean;
  onExpand: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = pathname === "/dashboard/finance";
  const section = resolveFinanceSection(params.get("section"), true);
  const [expanded, setExpanded] = useState(pathname.startsWith("/dashboard/finance"));
  const visible = expanded && !collapsed;

  return <div>
    <button type="button" aria-label="برندة المالية" title={collapsed ? "برندة المالية" : undefined}
      aria-expanded={visible} aria-controls="dashboard-finance-sections"
      onClick={() => { if (collapsed) { onExpand(); setExpanded(true); } else setExpanded(value => !value); }}
      className={`flex min-h-11 w-full items-center rounded-lg text-[13px] font-medium transition hover:bg-white/[0.065] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD77E] ${collapsed ? "justify-center" : "gap-2 px-3"} ${active ? "bg-[#E5B85C]/10 text-[#FFD77E]" : "text-[#D8CEC5]"}`}>
      <WalletCards className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <><span className="flex-1 text-right">برندة المالية</span><ChevronDown className={`h-4 w-4 ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></>}
    </button>
    <div id="dashboard-finance-sections" hidden={!visible} className="mr-5 mt-1 space-y-0.5 border-r border-[#E5B85C]/20 pr-2">
      {financeSections.map(({ id, label, icon: Icon }) => <Link key={id} href={`/dashboard/finance?section=${id}`} scroll={false} prefetch={false}
        onClick={event => {
          // Native history keeps the loaded workspace and its pending operation intact.
          if (active && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
            event.preventDefault();
            window.history.pushState(null, "", `/dashboard/finance?section=${id}`);
          }
          onNavigate?.();
        }} aria-current={active && section === id ? "page" : undefined}
        className={`flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs leading-5 hover:bg-white/[0.065] focus-visible:outline-2 focus-visible:outline-[#FFD77E] ${active && section === id ? "bg-[#E5B85C]/10 text-[#FFD77E]" : "text-[#B8A99C]"}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{label}</span>
      </Link>)}
      <Link href={`/finance/${encodeURIComponent(slug)}/pos`} onClick={onNavigate}
        className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-[#FFD77E] hover:bg-white/[0.065] focus-visible:outline-2 focus-visible:outline-[#FFD77E]">
        <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />كاشير المالية
      </Link>
    </div>
  </div>;
}
