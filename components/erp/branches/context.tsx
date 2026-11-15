'use client';
import {useEffect,useState,useTransition,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {getBranchContext,actBranches} from '@/app/actions/erp-branches';
import type {BranchContext,BranchScope} from '@/lib/erp/branches';
import styles from './context.module.css';

export function withBranchScope<T>(input:T,snapshot:unknown):T&{branchScope:BranchScope|null}{const branchScope=snapshot&&typeof snapshot==='object'&&'branchScope' in snapshot?snapshot.branchScope as BranchScope:null;return {...(input as object),branchScope} as T&{branchScope:BranchScope|null};}
type BranchContextProps={slug?:string;initialContext?:BranchContext|null;initialError?:string;children:ReactNode};
const branchLoadError='تعذر تحميل فرع العمل حاول مجددًا';

export function BranchContextProvider({slug,initialContext=null,initialError='',children}:BranchContextProps){
 const seed=initialContext&&(!slug||initialContext.slug===slug)?initialContext:null;
 // A different account/brand must never inherit the previous branch or pending read.
 return <BranchContextSession key={slug??seed?.slug??''} slug={slug} initialContext={seed} initialError={initialError}>{children}</BranchContextSession>;
}

function BranchContextSession({slug,initialContext=null,initialError='',children}:BranchContextProps){
 const [context,setContext]=useState<BranchContext|null>(initialContext);
 const [source,setSource]=useState({initialContext,initialError});
 const [error,setError]=useState(initialError),[retry,setRetry]=useState(0);
 const [stale,setStale]=useState(false),[pending,start]=useTransition();
 const router=useRouter();
 if(source.initialContext!==initialContext||source.initialError!==initialError){
  setSource({initialContext,initialError});setContext(initialContext);setError(initialError);setRetry(0);
  // A refreshed snapshot does not clear a cross-tab branch warning: its page may be stale.
 }
 useEffect(()=>{
  if(initialContext||(initialError&&retry===0))return;
  let alive=true;
  const timer=setTimeout(()=>{if(alive){alive=false;setError(branchLoadError);}},15000);
  void getBranchContext(slug).then(result=>{
   if(!alive)return;
   if(result.ok&&(!slug||result.data.slug===slug)){setContext(result.data);setError('');}
   else setError(result.ok?branchLoadError:result.message);
  }).catch(()=>{if(alive)setError(branchLoadError);}).finally(()=>clearTimeout(timer));
  return()=>{alive=false;clearTimeout(timer);};
 },[slug,initialContext,initialError,retry]);
 useEffect(()=>{if(!context)return;const channel=new BroadcastChannel(`erp-branch-${context.slug}`);channel.onmessage=()=>{setStale(true);router.refresh()};return()=>channel.close()},[context,router]);
 function select(id:string){if(!context)return;setError('');start(async()=>{try{const result=await actBranches(context.slug,{action:'select',payload:{id:id||null,revision:context.scope.revision}},crypto.randomUUID());if(!result.ok){setError(result.message);return;}const channel=new BroadcastChannel(`erp-branch-${context.slug}`);channel.postMessage('changed');channel.close();window.location.reload();}catch{setError('تعذر تغيير فرع العمل حاول مجددًا');}});}
 return <><section dir="rtl" className={styles.bar} aria-label="اختيار الفرع"><label className={styles.field}>الفرع<select aria-label="فرع العمل" disabled={pending||!context} value={context?.scope.branchId??''} onChange={e=>select(e.target.value)}>{context?.canAll?<option value="">جميع الفروع</option>:<option value="">{context?'اختر الفرع':error?'تعذر تحميل الفروع':'جارٍ تحميل الفروع'}</option>}{context?.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><details className={styles.help}><summary aria-label="ما فائدة اختيار الفرع">؟</summary><p>اختر الفرع لعرض سجلاته وتسجيل العمليات الجديدة عليه، أو جميع الفروع لعرض سجلاتها معًا</p></details>{error&&<p className={styles.error} role="alert">{error}{!context&&<button type="button" className="mx-2 underline" onClick={()=>{setError('');setRetry(value=>value+1);}}>إعادة المحاولة</button>}</p>}</section>{stale?<section role="alert" className="rounded-xl border p-5"><p>تغير فرع العمل في نافذة أخرى أعد تحميل الصفحة قبل المتابعة</p><button type="button" onClick={()=>window.location.reload()}>إعادة التحميل</button></section>:<div aria-busy={(!context&&!error)||pending} onClickCapture={e=>{if(!context||pending){e.preventDefault();e.stopPropagation()}}} onSubmitCapture={e=>{if(!context||pending){e.preventDefault();e.stopPropagation()}}}>{children}</div>}</>;
}
