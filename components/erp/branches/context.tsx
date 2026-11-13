'use client';
import {useEffect,useState,useTransition,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {getBranchContext,actBranches} from '@/app/actions/erp-branches';
import type {BranchContext,BranchScope} from '@/lib/erp/branches';

export function withBranchScope<T>(input:T,snapshot:unknown):T&{branchScope:BranchScope|null}{const branchScope=snapshot&&typeof snapshot==='object'&&'branchScope' in snapshot?snapshot.branchScope as BranchScope:null;return {...(input as object),branchScope} as T&{branchScope:BranchScope|null};}
export function BranchContextProvider({slug,children}:{slug?:string;children:ReactNode}){
 const [context,setContext]=useState<BranchContext|null>(null),[error,setError]=useState(''),[stale,setStale]=useState(false),[pending,start]=useTransition();const router=useRouter();
 useEffect(()=>{let alive=true;void getBranchContext(slug).then(result=>{if(!alive)return;if(result.ok){setContext(result.data);}else setError(result.message)});return()=>{alive=false;}},[slug]);
 useEffect(()=>{if(!context)return;const channel=new BroadcastChannel(`erp-branch-${context.slug}`);channel.onmessage=()=>{setStale(true);router.refresh()};return()=>channel.close()},[context,router]);
 function select(id:string){if(!context)return;setError('');start(async()=>{const result=await actBranches(context.slug,{action:'select',payload:{id:id||null,revision:context.scope.revision}},crypto.randomUUID());if(!result.ok){setError(result.message);return;}const channel=new BroadcastChannel(`erp-branch-${context.slug}`);channel.postMessage('changed');channel.close();window.location.reload()});}
 return <><section dir="rtl" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#eaded5] bg-white p-3"><label className="flex items-center gap-2">فرع العمل<select aria-label="فرع العمل" className="rounded-lg border border-[#d8c7bb] px-3 py-2" disabled={pending||!context} value={context?.scope.branchId??''} onChange={e=>select(e.target.value)}>{context?.canAll?<option value="">جميع الفروع</option>:<option value="">اختر الفرع</option>}{context?.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><span className="text-sm text-[#7a6458]">ينطبق الاختيار على سجلات النظام والعمليات الجديدة</span>{error&&<p role="alert">{error}</p>}</section>{stale?<section role="alert" className="rounded-xl border p-5"><p>تغير فرع العمل في نافذة أخرى أعد تحميل الصفحة قبل المتابعة</p><button onClick={()=>window.location.reload()}>إعادة التحميل</button></section>:<div aria-busy={!context||pending} onClickCapture={e=>{if(!context||pending){e.preventDefault();e.stopPropagation()}}} onSubmitCapture={e=>{if(!context||pending){e.preventDefault();e.stopPropagation()}}}>{children}</div>}</>;
}
