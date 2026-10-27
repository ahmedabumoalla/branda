"use client";
import { useEffect,useRef,useState } from "react";
import { RefreshCw,ShieldCheck,Download } from "lucide-react";
import { fetchFinanceControlReportAction,fetchFinanceJournalExportAction,fetchFinancePeriodClosuresAction } from "@/app/actions/finance-control-report";
import { collectJournalExport,controlReportDifferences,type FinanceControlReport } from "@/lib/finance/control-report";
import { downloadFinanceCsv,financeDate,Numeric } from "./finance-ui";
import shared from "./finance.module.css";
import s from "./finance-control-panel.module.css";

export function FinanceControlPanel({slug,visible,snapshotVersion}:{slug?:string;visible:boolean;snapshotVersion:object}) {
 const [report,setReport]=useState<{slug?:string;data:FinanceControlReport}|null>(null),[error,setError]=useState("");
 const [revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[completed,setCompleted]=useState(0);
 const flight=useRef(false),alive=useRef(true);
 const attempted=useRef<{slug?:string;version:object;revision:number}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!visible||flight.current||(attempted.current&&attempted.current.slug===slug&&attempted.current.version===snapshotVersion&&attempted.current.revision===revision))return;
  attempted.current={slug,version:snapshotVersion,revision};
  flight.current=true;
  void Promise.resolve().then(()=>{if(alive.current)setLoading(true);return fetchFinanceControlReportAction(slug);}).then(result=>{
   if(!alive.current)return;
   if(result.ok){setReport({slug,data:result.data});setError("");}else setError(result.message);
  }).catch(()=>{if(alive.current)setError("تعذر تحديث الرقابة المالية أعد المحاولة");}).finally(()=>{flight.current=false;if(alive.current){setLoading(false);setCompleted(v=>v+1);}});
 },[slug,visible,snapshotVersion,revision,completed]);
 const current=report?.slug===slug?report?.data:null;
 const checks=current?controlReportDifferences(current):null;
 return <section className={s.panel} hidden={!visible} aria-label="الرقابة المحاسبية">
  <header><div><span className={s.eyebrow}><ShieldCheck size={16} aria-hidden="true"/>الرقابة المحاسبية</span><h2>أرقام قابلة للمطابقة</h2></div><button type="button" className={shared.secondary} disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={16} aria-hidden="true"/>{loading?"جار التحديث":"تحديث الرقابة"}</button></header>
  {error&&<p role="alert" className={shared.error}>{error}{current&&" آخر تقرير ناجح ما زال معروضًا"}</p>}
  {!current||!checks?<p role="status">{loading?"جار مطابقة الدفتر والمخزون":"التقرير غير متاح حاليًا"}</p>:<>
   <p className={s.help}>أرصدة تراكمية لجميع القيود حتى {financeDate(current.generatedAt)} ولا تتأثر بتصفية جدول اليومية</p>
   <div className={s.checks}>
    <article data-state={checks.trial===0?"ok":"warning"}><span>اتزان القيود</span><strong>{checks.trial===0?"متزن":"فرق يحتاج مراجعة"}</strong><small>مدين <Numeric value={current.debit} money/> · دائن <Numeric value={current.credit} money/></small>{checks.trial!==0&&<b>الفرق <Numeric value={checks.trial} money/></b>}</article>
    <article data-state={checks.inventory===0?"ok":"warning"}><span>مطابقة المخزون بالدفتر</span><strong>{checks.inventory===0?"متطابق":"فرق يحتاج مراجعة"}</strong><small>المخزون <Numeric value={current.inventoryStock} money/> · الدفتر <Numeric value={current.inventoryLedger} money/></small>{checks.inventory!==0&&<b>الفرق <Numeric value={checks.inventory} money/></b>}</article>
    <article data-state={checks.costComplete?"ok":"warning"}><span>جودة بيانات التكلفة</span><strong>{checks.costComplete?"تكاليف موثقة":"الربح يحتاج مراجعة التكلفة"}</strong><small>{current.unknownCostLines} بند بلا تكلفة موثقة · {current.estimatedCostLines} تقديري · {current.legacyCostLines} تاريخي</small></article>
   </div>
   <div className={s.columns}><section><h3>من الإيراد إلى الربح الدفتري</h3>{[["صافي الإيراد دون الضريبة",current.revenue],["تكلفة المبيعات المسجلة",current.cost],["مجمل الربح الدفتري",current.revenue-current.cost],["مصروفات وتسويات أخرى",current.otherExpenses],["الربح الدفتري",current.bookProfit]].map(([label,value])=><div className={s.line} key={String(label)}><span>{label}</span><strong><Numeric value={Number(value)} money/></strong></div>)}<p className={s.help}>الربح حسب القيود المسجلة قبل أي تكاليف أو مصاريف لم تُسجل بعد مؤشرات التكلفة تشمل بنود البيع والمرتجعات التاريخية</p></section>
    <section><h3>أرصدة الضريبة والفترة</h3>{[["رصيد ضريبة المخرجات",current.vatOutput],["رصيد ضريبة المدخلات",current.vatInput],["صافي رصيد الضريبة",current.vatOutput-current.vatInput]].map(([label,value])=><div className={s.line} key={String(label)}><span>{label}</span><strong><Numeric value={Number(value)} money/></strong></div>)}<div className={s.line}><span>آخر يوم مقفل</span><strong>{current.closedThrough??"لم تُقفل فترة بعد"}</strong></div><p className={s.help}>هذه أرصدة دفترية وليست إقرارًا ضريبيًا معتمدًا الرصيد السالب للضريبة يمثل صافي رصيد مدين</p></section></div>
  </>}
 </section>;
}

export function FinanceJournalExport({slug,from,to,query}:{slug?:string;from:string;to:string;query:string}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[progress,setProgress]=useState("");const running=useRef(false);
 return <div><button type="button" className={shared.secondary} disabled={busy} onClick={async()=>{
  if(running.current)return;running.current=true;setBusy(true);setError("");setProgress("");
  try{const result=await collectJournalExport({from,to,query},async filter=>{const response=await fetchFinanceJournalExportAction(filter,slug);if(!response.ok)throw new Error(response.message);return response.data;},(count,total)=>setProgress(`${count} / ${total}`));
   downloadFinanceCsv(`branda-journal-${from||"all"}-${to||"today"}.csv`,[["التاريخ","المستند","رمز الحساب","الحساب","البيان","مدين","دائن"],...result.rows.map(row=>[financeDate(row.created_at),row.document_number,row.account_code,row.account_name,row.memo,row.debit,row.credit]),["الإجمالي","","","","",result.debit,result.credit]]);
  }catch(cause){setError(cause instanceof Error?cause.message:"تعذر تصدير اليومية");}finally{running.current=false;setBusy(false);}
 }}><Download size={16} aria-hidden="true"/>{busy?`جار تجهيز اليومية ${progress}`:"تصدير كامل نتائج اليومية"}</button>{error&&<p className={shared.error} role="alert">{error}</p>}</div>;
}

export function FinancePeriodHistory({slug,visible=true}:{slug?:string;visible?:boolean}) {
 const [data,setData]=useState<Awaited<ReturnType<typeof fetchFinancePeriodClosuresAction>>|null>(null),[open,setOpen]=useState(false),[attempt,setAttempt]=useState(0);
 const requested=useRef<string|null>(null),scope=useRef(slug),alive=useRef(true);
 useEffect(()=>{scope.current=slug;},[slug]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const key=JSON.stringify([slug,attempt]);if(!open||!visible||requested.current===key)return;requested.current=key;void fetchFinancePeriodClosuresAction(slug).then(result=>{if(alive.current&&scope.current===slug)setData(result);}).catch(()=>{if(alive.current&&scope.current===slug)setData({ok:false,message:"تعذر تحميل سجل الإقفال"});});},[open,slug,attempt,visible]);
 return <section className={s.panel}><button type="button" className={shared.secondary} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>سجل إقفال الفترات</button>{open&&(!data?<p role="status">جار تحميل السجل</p>:!data.ok?<><p role="alert">{data.message}</p><button type="button" className={shared.secondary} onClick={()=>setAttempt(v=>v+1)}>إعادة المحاولة</button></>:<><p className={s.help}>{data.data.hasMore?`آخر 50 إقفالًا من ${data.data.total}`:`${data.data.total} إقفال مسجل`}</p><ol className={s.history}>{data.data.rows.map(row=><li key={row.id}><strong>إقفال حتى {row.closed_through}</strong><span>{row.actor_name} · {financeDate(row.created_at)}</span><p>{row.reason}</p></li>)}</ol></>)}</section>;
}
