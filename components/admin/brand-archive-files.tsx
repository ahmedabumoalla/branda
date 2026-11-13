'use client';
import { useState,useTransition } from 'react';
import { listArchivedBrandFiles,signArchivedBrandFile } from '@/app/actions/brand-archive-files';

export function BrandArchiveFiles({cafeId}:{cafeId:string}) {
  const [rows,setRows]=useState<{bucket:string;path:string}[]>([]),[loaded,setLoaded]=useState(false),[more,setMore]=useState(false),[message,setMessage]=useState(''),[link,setLink]=useState<{url:string;path:string;bucket:string}|null>(null),[pending,start]=useTransition();
  const load=()=>start(async()=>{try{const next=await listArchivedBrandFiles(cafeId,rows.length);setRows(old=>[...old,...next]);setMore(next.length===50);setLoaded(true);setMessage('');}catch{setMessage('تعذر تحميل ملفات الأرشيف حاول مجددًا');}});
  return <section aria-label="ملفات العلامة المؤرشفة"><h3>الصور والمرفقات المؤرشفة</h3><p>معاينة وتنزيل الملفات محفوظة للسوبرأدمن دون حذفها</p>
    {!loaded&&<button type="button" disabled={pending} onClick={load}>عرض ملفات الأرشيف</button>}
    {loaded&&!rows.length&&<p>لا توجد ملفات محفوظة في أرشيف التخزين لهذه العلامة</p>}
    <ul>{rows.map(row=><li key={`${row.bucket}/${row.path}`}><bdi>{row.path.split('/').at(-1)}</bdi> <small><bdi>{row.bucket}</bdi></small> <button type="button" disabled={pending} onClick={()=>start(async()=>{setLink(null);try{setLink({url:await signArchivedBrandFile(cafeId,row.bucket,row.path),path:row.path,bucket:row.bucket});setMessage('الرابط صالح لمدة دقيقة ويمكن تجهيزه مجددًا');}catch{setMessage('تعذر تجهيز الملف حاول مجددًا');}})}>تجهيز رابط التنزيل</button>{link?.path===row.path&&link.bucket===row.bucket&&<a href={link.url} target="_blank" rel="noopener noreferrer">فتح الملف أو تنزيله</a>}</li>)}</ul>
    {more&&<button type="button" disabled={pending} onClick={load}>تحميل المزيد من الملفات</button>}{message&&<p role="status">{message}</p>}
  </section>;
}
