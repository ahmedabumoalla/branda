"use client";
import { usePathname,useRouter } from 'next/navigation';
import { useState,type ReactNode } from 'react';
import { logoutFinanceAction } from '@/app/actions/finance-access';
import Link,{ErpNavigationProvider} from './navigation';
import {erpHref} from '@/lib/erp/navigation';
import s from './staff-shell.module.css';
import {BranchContextProvider} from './branches/context';
import {mindErpNavigationVisible} from '@/lib/platform/mind-navigation';
export function StaffShell({slug,name,domains,children}:{slug:string;name:string;domains:{key:string;label:string;href:string}[];children:ReactNode}) {
 const pathname=usePathname(),router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <ErpNavigationProvider slug={slug}><div className={s.shell}><aside className={s.sidebar}><h1>برندة</h1><p>{name}</p><nav aria-label="أقسام النظام"><Link href="/dashboard/system" aria-current={pathname===`/finance/${slug}/system`?'page':undefined}>مساحة العمل</Link>{domains.filter(d=>mindErpNavigationVisible(slug,d.key)).map(d=><Link key={d.key} href={d.href} aria-current={pathname===erpHref(d.href,slug)||pathname.startsWith(erpHref(d.href,slug)+'/')?'page':undefined}>{d.label}</Link>)}</nav></aside><main className={s.content}><header className={s.heading}><h2>{name}</h2><button className={s.logout} disabled={busy} onClick={async()=>{setBusy(true);try{await logoutFinanceAction();router.replace(`/finance/${slug}/system/login`);router.refresh();}catch{setError('تعذر تسجيل الخروج حاول مجددًا');setBusy(false);}}}>{busy?'جار الخروج':'تسجيل الخروج'}</button></header>{error&&<p role="alert">{error}</p>}<BranchContextProvider slug={slug}>{children}</BranchContextProvider></main></div></ErpNavigationProvider>;
}
