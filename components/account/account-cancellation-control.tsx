'use client';

import { useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { cancelBrandAccount } from '@/app/actions/account-cancellation';
import { clearDashboardShellSnapshot } from '@/lib/performance/dashboard-shell-client';
import s from './account-cancellation.module.css';

export function AccountCancellationControl({ cafeId, slug, brandName }: { cafeId: string; slug: string; brandName: string }) {
  const id = useId(), [open, setOpen] = useState(false), [confirmation, setConfirmation] = useState(''), [password, setPassword] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState(''), [complete, setComplete] = useState(false), [pending, start] = useTransition();
  const request = useRef<string | null>(null), inFlight = useRef(false);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || pending || confirmation.trim() !== slug || !password || complete) return;
    inFlight.current = true;
    request.current ??= crypto.randomUUID();
    start(async () => {
      try {
        const result = await cancelBrandAccount({ cafeId, confirmation, password, reason, requestId: request.current });
        setMessage(result.message);
        if (result.ok) { setComplete(true); setPassword(''); clearDashboardShellSnapshot(); }
      } catch { setMessage('تعذر تأكيد الإلغاء أعد المحاولة للتحقق من النتيجة'); }
      finally { inFlight.current = false; }
    });
  }
  return <section className={s.panel} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>إلغاء حساب العلامة</h2>
    <p>يتوقف الوصول والخدمات لهذه العلامة وتبقى جميع بياناتها مؤرشفة لدى السوبرأدمن مع توثيق أنك طلبت الإلغاء</p>
    <p>لا يؤثر الإلغاء على علاماتك الأخرى ولا يحذف السجلات المالية أو المنيو أو الولاء أو الملفات</p>
    {complete ? <div role="status"><p>{message}</p><Link href="/account/cancel" prefetch={false}>عرض حسابات العلامات</Link><Link href="/" prefetch={false}>العودة إلى الرئيسية</Link></div> : <>
      {!open ? <button type="button" className={s.danger} onClick={() => setOpen(true)}>إلغاء حساب {brandName}</button> : <form onSubmit={submit}>
        <p className={s.warning}>أنت تؤكد إلغاء حساب <strong>{brandName}</strong> وإيقاف خدماته وأرشفة تفاصيله لدى إدارة المنصة</p>
        <label htmlFor={`${id}-slug`}>اكتب الرابط المختصر <bdi>{slug}</bdi> للتأكيد</label>
        <input id={`${id}-slug`} dir="ltr" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} required />
        <label htmlFor={`${id}-password`}>كلمة المرور الحالية لحساب المالك</label>
        <input id={`${id}-password`} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={pending} required maxLength={128} />
        <label htmlFor={`${id}-reason`}>سبب الإلغاء اختياري</label>
        <textarea id={`${id}-reason`} value={reason} onChange={event => setReason(event.target.value)} disabled={pending} maxLength={1000} rows={3} />
        {message && <p role="alert">{message}</p>}
        <div className={s.actions}><button type="submit" className={s.danger} disabled={pending || confirmation.trim() !== slug || !password} aria-busy={pending}>{pending ? 'جارٍ تأكيد الإلغاء' : 'تأكيد إلغاء حساب العلامة وأرشفته'}</button><button type="button" disabled={pending} onClick={() => { setOpen(false); setPassword(''); setMessage(''); }}>تراجع</button></div>
      </form>}
    </>}
  </section>;
}
