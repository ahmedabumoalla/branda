"use client";
import { DashboardNavigationLink as NextLink } from '@/components/dashboard/dashboard-navigation-link';
import { useRouter as useNextRouter } from 'next/navigation';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { erpHref } from '@/lib/erp/navigation';
const Tenant = createContext<string | undefined>(undefined);
type EmbeddedNavigation = { navigate: (href: string) => void; refresh: () => void };
const Embedded = createContext<EmbeddedNavigation | null>(null);
export function ErpEmbeddedNavigationProvider({ navigation, children }: { navigation: EmbeddedNavigation; children: ReactNode }) {
  return <Embedded.Provider value={navigation}>{children}</Embedded.Provider>;
}
export function ErpNavigationProvider({slug,children}:{slug:string;children:ReactNode}) { return <Tenant.Provider value={slug}>{children}</Tenant.Provider>; }
export default function ErpLink({href,onClick,...props}:ComponentProps<typeof NextLink>) {
  const slug=useContext(Tenant),embedded=useContext(Embedded);
  if(embedded && typeof href==='string' && /^\/(dashboard\/(system|finance)|finance\/[^/]+\/system)(\/|\?|$)/.test(href)) return <NextLink {...props} href={href} prefetch={false} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();embedded.navigate(href);}}}/>;
  return <NextLink {...props} onClick={onClick} href={typeof href==='string'?erpHref(href,slug):{...href,pathname:href.pathname?erpHref(href.pathname,slug):href.pathname}}/>;
}
export function useRouter() {
  const router=useNextRouter(),slug=useContext(Tenant),embedded=useContext(Embedded);
  if(embedded)return {...router,push:(href:string)=>embedded.navigate(href),replace:(href:string)=>embedded.navigate(href),refresh:()=>embedded.refresh(),prefetch:()=>Promise.resolve()};
  return {...router,push:(href:string,options?:Parameters<typeof router.push>[1])=>router.push(erpHref(href,slug),options),replace:(href:string,options?:Parameters<typeof router.replace>[1])=>router.replace(erpHref(href,slug),options),prefetch:(href:string,options?:Parameters<typeof router.prefetch>[1])=>router.prefetch(erpHref(href,slug),options)};
}
