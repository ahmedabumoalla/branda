"use client";

import { DashboardNavigationLink as Link } from "./dashboard-navigation-link";
import { useId, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Star as LoyaltyIcon, WalletCards } from "lucide-react";
import { resolveFinanceMenuEntry, resolveFinanceSection } from "@/components/finance/finance-navigation";
import { integratedSystemGroupsForBrand, systemItemHref } from "./integrated-system-navigation";
import styles from "./finance-sidebar-menu.module.css";
import { NAQWA_SLUG } from "@/lib/platform/naqwa";
import { erpModuleAllowed } from "@/lib/platform/erp-modules";

export function FinanceSidebarMenu({ collapsed, onExpand, onNavigate, cafeSlug = "", enabledFeatures = [], isSalon = false, isGifts = false, loyaltyOnly = false, allowedModules = null }: {
  collapsed: boolean;
  onExpand: () => void;
  onNavigate?: () => void;
  cafeSlug?: string;
  enabledFeatures?: readonly string[];
  isSalon?: boolean;
  isGifts?: boolean;
  loyaltyOnly?: boolean;
  /** Sections included by the brand packages; null means every section */
  allowedModules?: readonly string[] | null;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  const active = pathname === "/dashboard/finance";
  const systemActive = pathname.startsWith("/dashboard/system/");
  const section = resolveFinanceSection(params.get("section"), true);
  const context = { cafeSlug, enabledFeatures, isSalon, isGifts };
  const groups = integratedSystemGroupsForBrand(cafeSlug).filter(group => (!loyaltyOnly || group.id === "loyalty") && erpModuleAllowed(allowedModules, group.id)).map(group => group.id === "settings" ? { ...group, items: group.items.map(item => item.href === "/dashboard/settings" ? { ...item, label: isGifts ? "إعدادات المتجر" : isSalon ? "إعدادات الصالون" : item.label } : item) } : group);
  const currentEntry = resolveFinanceMenuEntry(section, params.get("party"), params.get("view"));
  const closestSystemHref = groups.flatMap(group => group.items.map(item => systemItemHref(item, context))).filter((href): href is string => !!href && href.startsWith("/dashboard/system/") && (pathname === href || pathname.startsWith(href + "/"))).sort((a,b) => b.length-a.length)[0];
  const isCurrent = (href: string | null) => {
    if (cafeSlug === NAQWA_SLUG && href?.startsWith("/dashboard/finance?")) {
      const target = new URLSearchParams(href.split("?")[1]);
      return active && target.get("section") === section && [...target].every(([key, value]) => key === "section" || params.get(key) === value);
    }
    return href !== null && (href.startsWith("/dashboard/finance?") ? active && (section === "sales" ? groups.find(group => group.id === "sales")?.items.find(item => item.id === currentEntry && !item.unavailable && systemItemHref(item, context) === href) !== undefined : href === `/dashboard/finance?section=${section}`) : href.startsWith("/dashboard/system/") ? closestSystemHref === href : pathname === href || ["/dashboard/branches", "/dashboard/settings", "/dashboard/subscription"].includes(href) && pathname.startsWith(`${href}/`));
  };
  const activeGroup = groups.find(group => group.items.some(item => isCurrent(systemItemHref(item, context))))?.id ?? null;
  const route = `${pathname}?${params.toString()}`;
  const [disclosure, setDisclosure] = useState({ route, expanded: !!activeGroup });
  const [selection, setSelection] = useState({ route, group: activeGroup });
  const expanded = disclosure.route === route ? disclosure.expanded : !!activeGroup;
  const openGroup = selection.route === route ? selection.group : activeGroup;
  if (disclosure.route !== route) setDisclosure({ route, expanded: !!activeGroup });
  if (selection.route !== route) setSelection({ route, group: activeGroup });
  const direct = !collapsed;
  const visible = (direct || expanded) && !collapsed;

  return <div className={`${styles.root} ${direct ? styles.direct : ""}`} aria-label={direct ? loyaltyOnly ? "الولاء" : "نظام برندة المتكامل" : undefined}>
    {!direct && <button type="button" aria-label={loyaltyOnly ? "الولاء" : "نظام برندة المتكامل"} title={collapsed ? loyaltyOnly ? "الولاء" : "نظام برندة المتكامل" : undefined}
      aria-expanded={visible} aria-controls={`${id}-sections`}
      onClick={() => { if (collapsed) onExpand(); if (loyaltyOnly) setSelection({ route, group: "loyalty" }); setDisclosure({ route, expanded: collapsed || !expanded }); }}
      className={`${styles.trigger} ${collapsed ? styles.collapsed : ""} ${activeGroup ? styles.active : ""}`}>
      {loyaltyOnly ? <LoyaltyIcon className={styles.icon} aria-hidden="true" /> : <WalletCards className={styles.icon} aria-hidden="true" />}
      {!collapsed && <><span className={styles.label}>نظام برندة المتكامل</span><ChevronDown className={`${styles.chevron} ${expanded ? styles.open : ""}`} aria-hidden="true" /></>}
    </button>}
    <div id={`${id}-sections`} hidden={!visible} className={styles.groups}>
      {groups.map(({ id: groupId, label, icon: Icon, items, direct: single }) => {
        // A group marked direct with one destination opens it in one click
        const directHref = single && items.length === 1 ? systemItemHref(items[0], context) : null;
        if (directHref) return <Link key={groupId} href={directHref} scroll={false} onClick={() => onNavigate?.()} aria-current={isCurrent(directHref) ? "page" : undefined} className={`${styles.groupTrigger} ${isCurrent(directHref) ? styles.active : ""}`}>
          <Icon className={styles.icon} aria-hidden="true" /><span className={styles.groupLabel}><span>{label}</span></span>
        </Link>;
        const available = items.some(item => systemItemHref(item, context));
        const open = openGroup === groupId;
        return <div key={groupId}>
          <button type="button" aria-expanded={open} aria-controls={`${id}-${groupId}`} onClick={() => setSelection({ route, group: open ? null : groupId })}
            className={`${styles.groupTrigger} ${activeGroup === groupId ? styles.active : ""}`}>
            <Icon className={styles.icon} aria-hidden="true" />
            <span className={styles.groupLabel}><span>{label}</span>{!available && groupId !== "loyalty" && <span className={styles.status}>غير متاح حاليًا</span>}</span>
            <ChevronDown className={`${styles.chevron} ${open ? styles.open : ""}`} aria-hidden="true" />
          </button>
          <div id={`${id}-${groupId}`} hidden={!open} className={styles.items}>
            {items.map((item, index) => {
              const href = systemItemHref(item, context);
              if (item.href === "/dashboard/loyalty/guide" && !href) return null;
              if (!href) return <div key={item.label} aria-disabled="true" className={`${styles.item} ${styles.unavailable}`}><span>{item.label}</span>{item.financeOnly ? <span className={styles.status}>متاحة مع باقة المالية</span> : groupId !== "loyalty" && <span className={styles.status}>غير متاح حاليًا</span>}</div>;
              return <Link key={item.label} href={href} scroll={false} prefetch={active && item.section ? false : cafeSlug === "mind-hospital" && visible && open && index < 3 && !isCurrent(href) ? true : undefined}
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
