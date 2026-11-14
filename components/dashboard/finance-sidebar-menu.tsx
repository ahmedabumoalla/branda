"use client";

import { DashboardNavigationLink as Link } from "./dashboard-navigation-link";
import { useId, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, WalletCards } from "lucide-react";
import { resolveFinanceMenuEntry, resolveFinanceSection } from "@/components/finance/finance-navigation";
import { integratedSystemGroupsForBrand, systemItemHref } from "./integrated-system-navigation";
import styles from "./finance-sidebar-menu.module.css";
import { NAQWA_SLUG } from "@/lib/platform/naqwa";

export function FinanceSidebarMenu({ collapsed, onExpand, onNavigate, cafeSlug = "", enabledFeatures = [], isSalon = false, isGifts = false }: {
  collapsed: boolean;
  onExpand: () => void;
  onNavigate?: () => void;
  cafeSlug?: string;
  enabledFeatures?: readonly string[];
  isSalon?: boolean;
  isGifts?: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  const active = pathname === "/dashboard/finance";
  const systemActive = pathname.startsWith("/dashboard/system/");
  const section = resolveFinanceSection(params.get("section"), true);
  const context = { cafeSlug, enabledFeatures, isSalon, isGifts };
  const groups = integratedSystemGroupsForBrand(cafeSlug);
  const currentEntry = resolveFinanceMenuEntry(section, params.get("party"), params.get("view"));
  const closestSystemHref = groups.flatMap(group => group.items.map(item => systemItemHref(item, context))).filter((href): href is string => !!href && href.startsWith("/dashboard/system/") && (pathname === href || pathname.startsWith(href + "/"))).sort((a,b) => b.length-a.length)[0];
  const isCurrent = (href: string | null) => {
    if (cafeSlug === NAQWA_SLUG && href?.startsWith("/dashboard/finance?")) {
      const target = new URLSearchParams(href.split("?")[1]);
      return active && target.get("section") === section && [...target].every(([key, value]) => key === "section" || params.get(key) === value);
    }
    return href !== null && (href.startsWith("/dashboard/finance?") ? active && (section === "sales" ? groups[0].items.find(item => item.id === currentEntry && !item.unavailable && systemItemHref(item, context) === href) !== undefined : href === `/dashboard/finance?section=${section}`) : href.startsWith("/dashboard/system/") ? closestSystemHref === href : pathname === href);
  };
  const activeGroup = groups.find(group => group.items.some(item => isCurrent(systemItemHref(item, context))))?.id ?? null;
  const route = `${pathname}?${params.toString()}`;
  const [disclosure, setDisclosure] = useState({ route, expanded: !!activeGroup });
  const [selection, setSelection] = useState({ route, group: activeGroup });
  const expanded = disclosure.route === route ? disclosure.expanded : !!activeGroup;
  const openGroup = selection.route === route ? selection.group : activeGroup;
  if (disclosure.route !== route) setDisclosure({ route, expanded: !!activeGroup });
  if (selection.route !== route) setSelection({ route, group: activeGroup });
  const direct = (active || systemActive) && !collapsed;
  const visible = (direct || expanded) && !collapsed;

  return <div className={`${styles.root} ${direct ? styles.direct : ""}`} aria-label={direct ? "نظام برندة المتكامل" : undefined}>
    {!direct && <button type="button" aria-label="نظام برندة المتكامل" title={collapsed ? "نظام برندة المتكامل" : undefined}
      aria-expanded={visible} aria-controls={`${id}-sections`}
      onClick={() => { if (collapsed) onExpand(); setDisclosure({ route, expanded: collapsed || !expanded }); }}
      className={`${styles.trigger} ${collapsed ? styles.collapsed : ""} ${activeGroup ? styles.active : ""}`}>
      <WalletCards className={styles.icon} aria-hidden="true" />
      {!collapsed && <><span className={styles.label}>نظام برندة المتكامل</span><ChevronDown className={`${styles.chevron} ${expanded ? styles.open : ""}`} aria-hidden="true" /></>}
    </button>}
    <div id={`${id}-sections`} hidden={!visible} className={styles.groups}>
      {groups.map(({ id: groupId, label, icon: Icon, items }) => {
        const available = items.some(item => systemItemHref(item, context));
        const open = openGroup === groupId;
        return <div key={groupId}>
          <button type="button" aria-expanded={open} aria-controls={`${id}-${groupId}`} onClick={() => setSelection({ route, group: open ? null : groupId })}
            className={`${styles.groupTrigger} ${activeGroup === groupId ? styles.active : ""}`}>
            <Icon className={styles.icon} aria-hidden="true" />
            <span className={styles.groupLabel}><span>{label}</span>{!available && <span className={styles.status}>غير متاح حاليًا</span>}</span>
            <ChevronDown className={`${styles.chevron} ${open ? styles.open : ""}`} aria-hidden="true" />
          </button>
          <div id={`${id}-${groupId}`} hidden={!open} className={styles.items}>
            {items.map(item => {
              const href = systemItemHref(item, context);
              if (!href) return <div key={item.label} aria-disabled="true" className={`${styles.item} ${styles.unavailable}`}><span>{item.label}</span><span className={styles.status}>غير متاح حاليًا</span></div>;
              return <Link key={item.label} href={href} scroll={false} prefetch={active && item.section ? false : undefined}
                onClick={event => {
                  // Preserve the loaded workspace and pending forms during section navigation.
                  if (active && item.section && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
                    event.preventDefault();
                    window.history.pushState(null, "", href);
                  }
                  onNavigate?.();
                }} aria-current={isCurrent(href) ? "page" : undefined} className={`${styles.item} ${isCurrent(href) ? styles.active : ""}`}>
                <span className={styles.label}>{item.label}</span>
              </Link>;
            })}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
