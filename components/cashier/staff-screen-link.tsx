"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { staffScreenFromPath, type StaffScreen } from "@/lib/cashier/workspace-types";

export const StaffScreenNavigation = createContext<((screen: StaffScreen) => void) | null>(null);

export function StaffScreenLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const navigate = useContext(StaffScreenNavigation);
  const screen = staffScreenFromPath(href);
  // Outside the retained workspace, preserve normal owner/login navigation.
  if (!navigate || !screen) return <Link href={href} className={className}>{children}</Link>;
  return <a href={href} className={className} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(screen);
  }}>{children}</a>;
}
