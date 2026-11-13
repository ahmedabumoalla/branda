"use client";
import { DashboardNavigationLink as NextLink } from '@/components/dashboard/dashboard-navigation-link';
import { useRouter as useNextRouter } from 'next/navigation';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { erpHref } from '@/lib/erp/navigation';
const Tenant = createContext<string | undefined>(undefined);
export function ErpNavigationProvider({slug,children}:{slug:string;children:ReactNode}) { return <Tenant.Provider value={slug}>{children}</Tenant.Provider>; }
export default function ErpLink({href,...props}:ComponentProps<typeof NextLink>) {
  const slug=useContext(Tenant);
  return <NextLink {...props} href={typeof href==='string'?erpHref(href,slug):{...href,pathname:href.pathname?erpHref(href.pathname,slug):href.pathname}}/>;
}
export function useRouter() {
  const router=useNextRouter(),slug=useContext(Tenant);
  return {...router,push:(href:string,options?:Parameters<typeof router.push>[1])=>router.push(erpHref(href,slug),options),replace:(href:string,options?:Parameters<typeof router.replace>[1])=>router.replace(erpHref(href,slug),options),prefetch:(href:string,options?:Parameters<typeof router.prefetch>[1])=>router.prefetch(erpHref(href,slug),options)};
}
