"use client";
import { financeCsvCell } from '@/lib/finance/csv';
import { commercialQuantity, documentCommercialLine, ledgerEditableAccountKinds } from '@/lib/finance/ledger';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import type { FinanceSnapshot } from '@/lib/finance/brand-finance';
import { executeLedgerAction, fetchLedgerAction, fetchLedgerDocumentAction, fetchLedgerEventsAction, fetchLedgerReportAction } from '@/app/actions/finance-ledger';
import { ledgerAccountKinds, ledgerAmount, ledgerQuantity, ledgerStatus, ledgerTotals, type LedgerAction, type LedgerAccount, type LedgerDocument, type LedgerDraft, type LedgerEvent, type LedgerLine, type LedgerReport, type LedgerSnapshot } from '@/lib/finance/ledger';
import styles from './ledger.module.css';
const today = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Riyadh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(date);
const emptyLine = (): LedgerLine => ({
  accountId: '',
  debit: '0',
  credit: '0',
  memo: ''
});
type Command = {
  action: LedgerAction;
  requestId: string;
  payload: Record<string, unknown>;
};
type Section = 'journals' | 'accounts' | 'periods' | 'reports';
const sections: Record<Section, string> = {
  journals: 'القيود والاعتماد',
  accounts: 'دليل الحسابات',
  periods: 'الفترات والسياسات',
  reports: 'الأستاذ وميزان المراجعة'
};
export function LedgerWorkspace({
  finance,
  slug,
  initialDocument
}: {
  finance: FinanceSnapshot;
  slug?: string;
  initialDocument?: string;
}) {
  const [section, setSection] = useState<Section>('journals');
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<LedgerDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [retry, setRetry] = useState<Command | null>(null);
  const [documentId, setDocumentId] = useState(initialDocument ?? '');
  const [notice, setNotice] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const mutationBusy = useRef(false);
  const dirty = useRef(false),
    loadTicket = useRef(0),
    errorBox = useRef<HTMLDivElement>(null);
  const canWrite = ['owner', 'manager', 'accountant'].includes(finance.role);
  const separateApproverRequired = !!snapshot?.settings.maker_checker && !!selected &&
    [selected.created_by, selected.last_edited_by].includes(finance.userId);
  const base = slug ? `/finance/${slug}` : '/dashboard/finance';
  const reload = useCallback(async (page = 0, selectId?: string) => {
    const ticket = ++loadTicket.current;
    setLoading(true);
    try {
      const response = await fetchLedgerAction(page, slug);
      if (ticket !== loadTicket.current) return;
      if (!response.ok) {
        setLoadError(response.message);
        return;
      }
      setLoadError('');
      setSnapshot(response.data);
      setOffset(page);
      if (selectId) setSelected(response.data.drafts.find(d => d.id === selectId) ?? null);else setSelected(current => current ? response.data.drafts.find(d => d.id === current.id) ?? null : null);
    } catch {
      if (ticket === loadTicket.current) setLoadError('تعذر الاتصال بدفتر الأستاذ؛ حاول تحديث البيانات');
    } finally {
      if (ticket === loadTicket.current) setLoading(false);
    }
  }, [slug]);
  useEffect(() => {
    const requests = loadTicket;
    startTransition(async () => {
      await reload(0);
    });
    return () => {
      requests.current++;
    };
  }, [reload]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    if (error || loadError) errorBox.current?.focus();
  }, [error, loadError]);
  function leave() {
    if (mutationBusy.current) return false;
    if (dirty.current && !window.confirm('توجد تعديلات غير محفوظة هل تريد مغادرة النموذج؟')) return false;
    dirty.current = false;
    setEditing(false);
    return true;
  }
  function navigate(next: Section) {
    if (leave()) {
      setSection(next);
      setError('');
      setNotice('');
      setRetry(null);
      setDocumentId('');
    }
  }
  function execute(action: LedgerAction, payload: Record<string, unknown>, existing?: Command) {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    const command = existing ?? {
      action,
      payload,
      requestId: crypto.randomUUID()
    };
    setError('');
    setNotice('');
    setRetry(null);
    startTransition(async () => {
      try {
        const response = await executeLedgerAction(command, slug);
        if (!response.ok) {
          setError(response.message);
          setRetry(command);
          return;
        }
        dirty.current = false;
        setEditing(false);
        setNotice('تم حفظ الإجراء وتسجيل أثره');
        if (action === 'account_save' && typeof response.data.id === 'string') setAccountId(response.data.id);
        await reload(offset, typeof response.data.id === 'string' && ['save', 'submit', 'approve', 'post', 'reverse', 'cancel'].includes(action) ? response.data.id : undefined);
      } catch {
        setError('لم يصل تأكيد العملية؛ أعد المحاولة بنفس الطلب لتجنب التكرار');
        setRetry(command);
      } finally {
        mutationBusy.current = false;
      }
    });
  }
  return <main className={styles.workspace} dir="rtl">
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>برندة المالية {finance.cafe.name}</p>
        <h1>دفتر الأستاذ</h1>
        <p>راجع المستند واعتمده ثم تابع أثره في الحسابات</p>
      </div>
      <Link href={`${base}?section=reports`} onClick={e => {
        if (!leave()) e.preventDefault();
      }}>العودة إلى الدفاتر والتقارير</Link>
    </header>
    <nav className={styles.navigation} aria-label="أقسام دفتر الأستاذ">{Object.entries(sections).map(([key, label]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} disabled={pending} onClick={() => navigate(key as Section)}>{label}</button>)}</nav>
    {(error || loadError) && <div className={styles.error} role="alert" tabIndex={-1} ref={errorBox}>
      <strong>{error ? 'لم يكتمل الإجراء' : 'تعذر تحديث دفتر الأستاذ'}</strong>
      {error && <p>{error}</p>}
      {loadError && <p>{loadError}</p>}
      {retry && <button disabled={pending} onClick={() => execute(retry.action, retry.payload, retry)}>إعادة المحاولة بنفس الطلب</button>}
      <button disabled={pending} onClick={() => startTransition(() => {
        void reload(offset);
      })}>تحديث البيانات</button>
    </div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {pending && <p role="status">جار تأكيد الإجراء</p>}
    {documentId && <DocumentDetails key={documentId} id={documentId} slug={slug} close={() => setDocumentId('')} open={setDocumentId} />}
    {loading && !snapshot ? <p role="status" className={styles.panel}>جار تحميل دفتر الأستاذ</p> : snapshot && <>
      {section === 'journals' && <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="journal-list-title">
          <div className={styles.bar}>
            <h2 id="journal-list-title">القيود</h2>
            {canWrite && <button disabled={pending} onClick={() => {
              if (leave()) {
                setSelected(null);
                setEditing(true);
              }
            }}>قيد جديد +</button>}
          </div>
          <p className={styles.muted}>{snapshot.settings.maker_checker ? 'الاعتماد من مستخدم آخر مطلوب' : 'يمكن للمنشئ الاعتماد وفق السياسة المحفوظة'}</p>
          {!snapshot.drafts.length ? <p className={styles.empty}>لا توجد قيود في هذه الصفحة ابدأ بمسودة متوازنة</p> : <ul className={styles.records}>{snapshot.drafts.map(d => <li key={d.id}>
              <button disabled={pending} aria-pressed={selected?.id === d.id} onClick={() => {
                if (leave()) setSelected(d);
              }}>
                <span>
                  <strong>{d.title}</strong>
                  <small>{d.fiscal_year} / {d.number} · {d.document_date}</small>
                </span>
                <span className={styles.badge}>{ledgerStatus[d.status]}</span>
              </button>
            </li>)}</ul>}
          <div className={styles.bar}>
            <button disabled={pending || loading || offset === 0} onClick={() => {
              if (leave()) startTransition(() => {
                void reload(Math.max(0, offset - 100));
              });
            }}>السابق</button>
            <span>صفحة {Math.floor(offset / 100) + 1}</span>
            <button disabled={pending || loading || !snapshot.hasMore} onClick={() => {
              if (leave()) startTransition(() => {
                void reload(offset + 100);
              });
            }}>التالي</button>
          </div>
        </section>
        <section className={styles.panel} aria-label="تفاصيل القيد">
          {editing ? <JournalForm key={selected?.id ?? 'new'} draft={selected} accounts={snapshot.accounts} dimensions={snapshot.dimensions??[]} pending={pending} onDirty={() => {
            dirty.current = true;
          }} save={payload => execute('save', payload)} cancel={() => {
            if (leave()) setEditing(false);
          }} /> : selected ? <>
            <div className={styles.bar}>
              <div>
                <p className={styles.eyebrow}>قيد {selected.fiscal_year} / {selected.number} · إصدار {selected.revision}</p>
                <h2>{selected.title}</h2>
              </div>
              <span className={styles.badge}>{ledgerStatus[selected.status]}</span>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>التاريخ المحاسبي</dt>
                <dd>{selected.document_date}</dd>
              </div>
              <div>
                <dt>العملة</dt>
                <dd>ريال سعودي</dd>
              </div>
            </dl>
            {selected.note && <p>{selected.note}</p>}
            <JournalLines lines={selected.lines} />
            <div className={styles.actions}>
              {canWrite && selected.status === 'draft' && <><button disabled={pending} onClick={() => setEditing(true)}>تعديل المسودة</button><button disabled={pending} onClick={() => execute('submit', {
                  id: selected.id,
                  revision: selected.revision
                })}>إرسال للاعتماد</button></>}
              {canWrite && selected.status === 'submitted' && !separateApproverRequired && <button disabled={pending} onClick={() => execute('approve', {
                id: selected.id,
                revision: selected.revision
              })}>اعتماد القيد</button>}
              {canWrite && selected.status === 'approved' && <button disabled={pending} onClick={() => execute('post', {
                id: selected.id,
                revision: selected.revision
              })}>ترحيل القيد إلى الأستاذ</button>}
              {selected.document_id && <button onClick={() => setDocumentId(selected.document_id!)}>فتح المستند المرحل</button>}
              {selected.reversal_document_id && <button onClick={() => setDocumentId(selected.reversal_document_id!)}>فتح مستند العكس</button>}
            </div>
            {selected.status === 'submitted' && separateApproverRequired && <p className={styles.muted}>يحتاج هذا القيد إلى اعتماد مستخدم آخر لم ينشئ المسودة أو يعدّلها</p>}
            {canWrite && ['draft', 'submitted', 'approved', 'posted'].includes(selected.status) && <ReasonAction key={`${selected.id}:${selected.revision}`} posted={selected.status === 'posted'} pending={pending} execute={(action, extra) => execute(action, {
              id: selected.id,
              revision: selected.revision,
              ...extra
            })} />}
            <AuditEvents key={`${selected.id}:${selected.revision}`} id={selected.id} revision={selected.revision} slug={slug} />
          </> : <div className={styles.empty}>
            <h2>اختر قيدًا للمراجعة</h2>
            <p>ستظهر الحسابات والمدين والدائن وسجل الاعتماد هنا</p>
          </div>}
        </section>
      </div>}
      {section === 'accounts' && <AccountEditor accounts={snapshot.accounts} accountId={accountId} select={setAccountId} leave={leave} pending={pending} canWrite={['owner', 'accountant'].includes(finance.role)} onDirty={() => {
        dirty.current = true;
      }} save={p => execute('account_save', p)} />}
      {section === 'periods' && <PeriodEditor snapshot={snapshot} pending={pending} owner={finance.role === 'owner'} execute={execute} />}
      {section === 'reports' && <ReportView accounts={snapshot.accounts} slug={slug} open={setDocumentId} />}
    </>}
  </main>;
}
function JournalLines({
  lines
}: {
  lines: LedgerLine[];
}) {
  const totals = ledgerTotals(lines);
  return <div className={styles.tableScroll}>
    <table>
      <caption>تفاصيل القيد بالريال السعودي</caption>
      <thead>
        <tr>
          <th>الحساب</th>
          <th>البيان</th>
          <th>مدين</th>
          <th>دائن</th>
        </tr>
      </thead>
      <tbody>{lines.map((l, i) => <tr key={i}>
          <td>{l.code} · {l.name}</td>
          <td>{l.memo || '—'}{l.projectName&&<small className={styles.muted}> · مشروع {l.projectName}</small>}{l.costCenterName&&<small className={styles.muted}> · مركز {l.costCenterName}</small>}</td>
          <td className={styles.numeric}>{ledgerAmount(l.debit)}</td>
          <td className={styles.numeric}>{ledgerAmount(l.credit)}</td>
        </tr>)}</tbody>
      <tfoot>
        <tr>
          <th colSpan={2}>الإجمالي</th>
          <td>{ledgerAmount(Number(totals.debit) / 100)}</td>
          <td>{ledgerAmount(Number(totals.credit) / 100)}</td>
        </tr>
      </tfoot>
    </table>
  </div>;
}
function JournalForm({
  draft,
  accounts,
  dimensions,
  pending,
  onDirty,
  save,
  cancel
}: {
  draft: LedgerDraft | null;
  accounts: LedgerAccount[];
  dimensions: NonNullable<LedgerSnapshot['dimensions']>;
  pending: boolean;
  onDirty: () => void;
  save: (p: Record<string, unknown>) => void;
  cancel: () => void;
}) {
  const [title, setTitle] = useState(draft?.title ?? ''),
    [date, setDate] = useState(draft?.document_date ?? today()),
    [note, setNote] = useState(draft?.note ?? '');
  const [lines, setLines] = useState<LedgerLine[]>(draft?.lines ?? [emptyLine(), emptyLine()]);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null),
    prefix = useId();
  const eligible = accounts.filter(a => a.active && !a.frozen && !a.is_group && ledgerEditableAccountKinds.some(kind => kind === a.kind));
  const totals = ledgerTotals(lines);
  function update(index: number, change: Partial<LedgerLine>) {
    setLines(current => current.map((line, i) => i === index ? {
      ...line,
      ...change
    } : line));
    onDirty();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!totals.valid) {
      setError('راجع الحسابات والمبالغ يجب أن يتساوى المدين والدائن وأن يحتوي كل سطر على جانب موجب واحد');
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    setError('');
    save({
      ...(draft ? {
        id: draft.id,
        revision: draft.revision
      } : {}),
      title,
      date,
      note,
      lines
    });
  }
  return <form onSubmit={submit} onChange={onDirty}>
    <h2>{draft ? 'تعديل المسودة' : 'قيد محاسبي جديد'}</h2>
    {error && <div role="alert" tabIndex={-1} ref={errorRef} className={styles.error}>
      {error}
      <a href={`#${prefix}-account-0`}>راجع أول سطر</a>
    </div>}
    <div className={styles.formGrid}>
      <label>
        عنوان القيد
        <input required maxLength={150} value={title} onChange={e => setTitle(e.target.value)} disabled={pending} />
      </label>
      <label>
        التاريخ المحاسبي
        <input type="date" required value={date} onChange={e => setDate(e.target.value)} disabled={pending} />
      </label>
    </div>
    <p className={styles.muted}>الحسابات الرقابية تُرحّل من مستنداتها المختصة لحماية تطابق الأستاذ والمخزون والذمم</p>
    {lines.map((line, i) => <fieldset key={i} disabled={pending} className={styles.lineForm}>
      <legend>السطر {i + 1}</legend>
      <label>
        الحساب
        <select id={`${prefix}-account-${i}`} required value={line.accountId} onChange={e => update(i, {
          accountId: e.target.value
        })}>
          <option value="">اختر الحساب</option>
          {eligible.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
      </label>
      <label>
        مدين
        <input inputMode="decimal" value={line.debit} onChange={e => update(i, {
          debit: e.target.value
        })} required pattern="[0-9]+(\.[0-9]{1,2})?" />
      </label>
      <label>
        دائن
        <input inputMode="decimal" value={line.credit} onChange={e => update(i, {
          credit: e.target.value
        })} required pattern="[0-9]+(\.[0-9]{1,2})?" />
      </label>
      <label>
        بيان السطر
        <input maxLength={300} value={line.memo} onChange={e => update(i, {
          memo: e.target.value
        })} />
      </label>
      <label>المشروع<select value={line.projectId??''} onChange={e=>update(i,{projectId:e.target.value||undefined})}><option value="">بدون مشروع</option>{dimensions.filter(d=>d.kind==='project'&&(d.active||d.id===line.projectId)).map(d=><option key={d.id} value={d.id}>{d.code} · {d.name}{!d.active?' · غير نشط':''}</option>)}</select></label>
      <label>مركز التكلفة<select value={line.costCenterId??''} onChange={e=>update(i,{costCenterId:e.target.value||undefined})}><option value="">بدون مركز</option>{dimensions.filter(d=>d.kind==='cost_center'&&(d.active||d.id===line.costCenterId)).map(d=><option key={d.id} value={d.id}>{d.code} · {d.name}{!d.active?' · غير نشط':''}</option>)}</select></label>
      {lines.length > 2 && <button type="button" onClick={() => {
        setLines(current => current.filter((_, n) => n !== i));
        onDirty();
      }}>حذف السطر {i + 1}</button>}
    </fieldset>)}
    <div className={styles.bar}>
      <button type="button" disabled={pending || lines.length >= 100} onClick={() => {
        setLines(current => [...current, emptyLine()]);
        onDirty();
      }}>إضافة سطر</button>
      <output aria-live="polite">المدين {ledgerAmount(Number(totals.debit) / 100)} · الدائن {ledgerAmount(Number(totals.credit) / 100)}</output>
    </div>
    <label>
      ملاحظة
      <textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} disabled={pending} />
    </label>
    <div className={styles.actions}>
      <button disabled={pending} type="submit">حفظ المسودة</button>
      <button type="button" disabled={pending} onClick={cancel}>رجوع</button>
    </div>
  </form>;
}
function ReasonAction({
  posted,
  pending,
  execute
}: {
  posted: boolean;
  pending: boolean;
  execute: (a: LedgerAction, p: Record<string, unknown>) => void;
}) {
  const [reason, setReason] = useState(''),
    [date, setDate] = useState(today());
  return <details className={styles.details}>
    <summary>{posted ? 'عكس القيد' : 'إلغاء القيد'}</summary>
    <form onSubmit={e => {
      e.preventDefault();
      execute(posted ? 'reverse' : 'cancel', {
        reason,
        ...(posted ? {
          date
        } : {})
      });
    }}>
      <p>{posted ? 'يُنشأ قيد مقابل مرتبط بالأصل دون تغيير القيد المرحل' : 'يبقى سجل المسودة والإجراء محفوظًا للمراجعة'}</p>
      {posted && <label>
        تاريخ العكس
        <input type="date" required value={date} onChange={e => setDate(e.target.value)} />
      </label>}
      <label>
        سبب الإجراء
        <textarea required minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      <button disabled={pending} type="submit">{posted ? 'تأكيد العكس' : 'تأكيد الإلغاء'}</button>
    </form>
  </details>;
}
function AuditEvents({
  id,
  revision,
  slug
}: {
  id: string;
  revision: number;
  slug?: string;
}) {
  const [events, setEvents] = useState<LedgerEvent[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false);
  const ticket = useRef(0);
  const load = useCallback(async (before: number | null) => {
    const seq = ++ticket.current;
    setLoading(true);
    try {
      const r = await fetchLedgerEventsAction(id, before, slug);
      if (seq !== ticket.current) return;
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setError('');
      setMore(r.data.length === 100);
      setEvents(old => [...new Map((before ? [...old, ...r.data] : r.data).map(e => [e.id, e])).values()].sort((a, b) => b.id - a.id));
    } catch {
      if (seq === ticket.current) setError('تعذر تحميل سجل الإجراءات؛ أعد المحاولة');
    } finally {
      if (seq === ticket.current) setLoading(false);
    }
  }, [id, slug]);
  useEffect(() => {
    let active = true;
    const requests = ticket;
    void Promise.resolve().then(() => {
      if (active) return load(null);
    });
    return () => {
      active = false;
      requests.current++;
    };
  }, [load, revision]);
  const names: Record<string, string> = {
    save: 'حفظ مسودة',
    submit: 'إرسال للمراجعة',
    approve: 'اعتماد',
    post: 'ترحيل',
    reverse: 'عكس',
    cancel: 'إلغاء'
  };
  return <section className={styles.audit}>
    <h3>سجل الإجراءات</h3>
    {error && <p role="alert">
      {error}
      <button onClick={() => {
        void load(null);
      }}>إعادة تحميل السجل</button>
    </p>}
    {loading && <p role="status">جار تحميل السجل</p>}
    <ol>{events.map(e => <li key={e.id}>
        <strong>{names[e.action] ?? e.action}</strong>
        <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString('ar-SA')}</time>
        {e.details.reason && <p>{e.details.reason}</p>}
      </li>)}</ol>
    {more && <button disabled={loading} onClick={() => {
      void load(events.at(-1)!.id);
    }}>إجراءات أقدم</button>}
  </section>;
}
function AccountEditor({
  accounts,
  accountId,
  select,
  leave,
  pending,
  canWrite,
  onDirty,
  save
}: {
  accounts: LedgerAccount[];
  accountId: string | null;
  select: (id: string | null) => void;
  leave: () => boolean;
  pending: boolean;
  canWrite: boolean;
  onDirty: () => void;
  save: (p: Record<string, unknown>) => void;
}) {
  const account = accounts.find(a => a.id === accountId) ?? null;
  const editable = !account || ledgerEditableAccountKinds.some(kind => kind === account.kind);
  const [key, setKey] = useState(0);
  return <div className={styles.columns}>
    <section className={styles.panel}>
      <div className={styles.bar}>
        <h2>دليل الحسابات</h2>
        {canWrite && <button disabled={pending} onClick={() => {
          if (leave()) {
            select(null);
            setKey(k => k + 1);
          }
        }}>حساب جديد</button>}
      </div>
      <ul className={styles.records}>{accounts.map(a => <li key={a.id}>
          <button disabled={pending} aria-pressed={a.id === accountId} onClick={() => {
            if (leave()) {
              select(a.id);
              setKey(k => k + 1);
            }
          }}>
            <span>
              <strong>{a.code} · {a.name}</strong>
              <small>{ledgerAccountKinds[a.kind]}{a.parent_id ? ` · ضمن ${accounts.find(p => p.id === a.parent_id)?.name ?? ''}` : ''}</small>
            </span>
            <span>{a.frozen ? 'مجمد' : !a.active ? 'متوقف' : a.is_group ? 'تجميعي' : 'ترحيل'}</span>
          </button>
        </li>)}</ul>
    </section>
    <section className={styles.panel}>{canWrite && editable ? <form key={`${account?.id ?? 'new'}:${account?.revision ?? 0}:${key}`} onChange={onDirty} onSubmit={e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          ...(account ? {
            id: account.id,
            revision: account.revision
          } : {}),
          name: f.get('name'),
          code: f.get('code'),
          kind: f.get('kind'),
          parentId: f.get('parentId') || null,
          isGroup: f.get('isGroup') === 'on',
          frozen: f.get('frozen') === 'on',
          active: f.get('active') === 'on'
        });
      }}>
        <fieldset disabled={pending} className={styles.accountFields}>
          <h2>{account ? 'تعديل الحساب' : 'حساب جديد'}</h2>
          <label>
            اسم الحساب
            <input name="name" defaultValue={account?.name} required maxLength={100} />
          </label>
          <div className={styles.formGrid}>
            <label>
              الرمز
              <input name="code" defaultValue={account?.code} required pattern="[A-Za-z0-9-]{1,30}" readOnly={!!account} />
            </label>
            <label>
              نوع الحساب
              <select name="kind" defaultValue={account?.kind ?? 'expense'}>{ledgerEditableAccountKinds.filter(k => !account || k === account.kind).map(k => <option key={k} value={k}>{ledgerAccountKinds[k]}</option>)}</select>
            </label>
          </div>
          <label>
            الحساب الأب
            <select name="parentId" defaultValue={account?.parent_id ?? ''}>
              <option value="">حساب رئيسي</option>
              {accounts.filter(a => a.is_group && a.id !== account?.id && a.active && !a.frozen).map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="isGroup" defaultChecked={account?.is_group} />
            حساب تجميعي لا يقبل قيودًا
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="active" defaultChecked={account?.active ?? true} />
            الحساب نشط
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="frozen" defaultChecked={account?.frozen} />
            تجميد الترحيل إلى الحساب
          </label>
          <p className={styles.muted}>الحسابات الرقابية الأساسية لا تُوقف ولا تُحذف للحفاظ على العمليات القائمة</p>
          <button disabled={pending}>حفظ الحساب</button>
        </fieldset>
      </form> : <p>{!editable ? 'تدار حسابات الخزينة والرقابة من أقسامها المختصة للحفاظ على أرصدتها وربطها بالعمليات' : 'يمكنك مراجعة دليل الحسابات بصلاحية القراءة'}</p>}</section>
  </div>;
}
function PeriodEditor({
  snapshot,
  pending,
  owner,
  execute
}: {
  snapshot: LedgerSnapshot;
  pending: boolean;
  owner: boolean;
  execute: (a: LedgerAction, p: Record<string, unknown>) => void;
}) {
  const [lastCompleteDay] = useState(() => today(new Date(Date.now() - 86_400_000)));
  return <div className={styles.columns}>
    <section className={styles.panel}>
      <h2>الفترات المالية</h2>
      {!snapshot.periods.length && <p>لا توجد فترات مسجلة في دفتر الأستاذ</p>}
      {snapshot.periods.map(p => <details className={styles.details} key={p.period_start}>
        <summary>{p.period_start} ← {p.period_end} · {p.closed ? 'مقفلة' : 'مفتوحة'}</summary>
        {owner && <form onSubmit={e => {
          e.preventDefault();
          execute(p.closed ? 'period_reopen' : 'period_close', {
            from: p.period_start,
            to: p.period_end,
            revision: p.revision,
            reason: new FormData(e.currentTarget).get('reason')
          });
        }}>
          <label>
            سبب 
            {p.closed ? 'إعادة الفتح' : 'الإقفال'}
            <textarea name="reason" required minLength={5} maxLength={1000} />
          </label>
          <button disabled={pending}>تأكيد {p.closed ? 'إعادة الفتح' : 'الإقفال'}</button>
        </form>}
      </details>)}
      {owner && <form onSubmit={e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        execute('period_close', {
          from: f.get('from'),
          to: f.get('to'),
          reason: f.get('reason')
        });
      }}>
        <h3>إقفال فترة جديدة</h3>
        <div className={styles.formGrid}>
          <label>
            من
            <input name="from" type="date" required />
          </label>
          <label>
            إلى
            <input name="to" type="date" max={lastCompleteDay} required />
          </label>
        </div>
        <label>
          سبب الإقفال
          <textarea name="reason" minLength={5} maxLength={1000} required />
        </label>
        <button disabled={pending}>إقفال الفترة</button>
      </form>}
    </section>
    <section className={styles.panel}>
      <h2>سياسة اعتماد المستندات</h2>
      <p>السياسة الحالية: {snapshot.settings.maker_checker ? 'فصل المنشئ عن المعتمد' : 'السماح باعتماد المنشئ'}</p>
      <p className={styles.muted}>تطبق السياسة على مسودات دفتر الأستاذ ويشمل الفصل منشئ المسودة وآخر من عدّلها</p>
      {snapshot.settings.initialized === false && <p>يبدأ دفتر الأستاذ بفصل منشئ القيد وآخر محرر له عن المعتمد</p>}
      {owner ? <form key={snapshot.settings.revision} onSubmit={e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        execute('settings', {
          revision: snapshot.settings.revision,
          makerChecker: f.get('makerChecker') === 'on',
          reason: f.get('reason')
        });
      }}>
        <label className={styles.check}>
          <input type="checkbox" name="makerChecker" defaultChecked={snapshot.settings.maker_checker} />
          يجب أن يعتمد المستند مستخدم غير منشئه وآخر محرر له
        </label>
        <label>
          سبب تعديل السياسة
          <textarea name="reason" minLength={5} maxLength={1000} required />
        </label>
        <button disabled={pending}>حفظ سياسة الاعتماد</button>
      </form> : <p>تعديل السياسة وإدارة الفترات متاحان للمالك</p>}
    </section>
  </div>;
}
function DocumentDetails({
  id,
  slug,
  close,
  open
}: {
  id: string;
  slug?: string;
  close: () => void;
  open: (id: string) => void;
}) {
  const [data, setData] = useState<LedgerDocument | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    void fetchLedgerDocumentAction(id, slug).then(r => {
      if (!active) return;
      if (r.ok) { setData(r.data); setError(''); } else setError(r.message);
    }).catch(() => {
      if (active) setError('تعذر تحميل المستند المالي؛ أعد المحاولة');
    });
    heading.current?.focus();
    return () => {
      active = false;
    };
  }, [id, slug, attempt]);
  return <section className={styles.panel} aria-label="المستند المالي">
    <div className={styles.bar}>
      <h2 tabIndex={-1} ref={heading}>المستند المالي {data?.document.number ?? ''}</h2>
      <button onClick={close}>إغلاق التفاصيل</button>
    </div>
    {error ? <p role="alert">
      {error}
      <button onClick={() => setAttempt(n => n + 1)}>إعادة المحاولة</button>
    </p> : !data ? <p role="status">جار تحميل المستند</p> : <><dl className={styles.facts}>
        <div>
          <dt>التاريخ</dt>
          <dd>{new Date(data.document.created_at).toLocaleDateString('ar-SA')}</dd>
        </div>
        <div>
          <dt>الطرف</dt>
          <dd>{data.partyName ?? '—'}</dd>
        </div>
        <div>
          <dt>المستودع</dt>
          <dd>{data.warehouseName ?? '—'}</dd>
        </div>
        <div>
          <dt>الإجمالي</dt>
          <dd>{ledgerAmount(data.document.total)}</dd>
        </div>
      </dl><p>{data.document.note}</p>{data.document.reference_id && <button onClick={() => open(data.document.reference_id!)}>فتح المستند الأصلي</button>}{data.lines.length > 0 && <div className={styles.tableScroll}>
        <table>
          <caption>أصناف المستند</caption>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>الصافي</th>
              <th>الضريبة</th>
              <th>التكلفة</th>
            </tr>
          </thead>
          <tbody>{data.lines.map(l => <tr key={l.id}>
              <td>{l.name}{l.conversion_version_id && <small><br/>{l.commercial_unit}</small>}</td>
              <td>{commercialQuantity(documentCommercialLine(l).quantity)}{l.conversion_version_id && <small><br/>الأساسية: {ledgerQuantity(l.quantity)} {l.base_unit}</small>}</td>
              <td>{new Intl.NumberFormat('ar-SA', {
                  maximumFractionDigits: 6
                }).format(documentCommercialLine(l).price)}</td>
              <td>{ledgerAmount(l.net)}</td>
              <td>{ledgerAmount(l.tax)}</td>
              <td>{ledgerAmount(l.cost)}</td>
            </tr>)}</tbody>
        </table>
      </div>}<JournalLines lines={data.journal.map(j => ({
        accountId: j.id,
        code: j.accountCode,
        name: j.accountName,
        debit: j.debit,
        credit: j.credit,
        memo: j.memo,
        projectName:j.projectName??undefined,
        costCenterName:j.costCenterName??undefined
      }))} /></>}
  </section>;
}
function ReportView({
  accounts,
  slug,
  open
}: {
  accounts: LedgerAccount[];
  slug?: string;
  open: (id: string) => void;
}) {
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`),
    [to, setTo] = useState(today()),
    [accountId, setAccountId] = useState('');
  const [report, setReport] = useState<LedgerReport | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const ticket = useRef(0);
  useEffect(() => () => {
    ticket.current++;
  }, []);
  async function load(offset = 0, locked?: LedgerReport) {
    const n = ++ticket.current;
    setLoading(true);
    setError('');
    try {
      const r = await fetchLedgerReportAction(locked?.from ?? from, locked?.to ?? to, locked?.accountId ?? (accountId || null), offset, slug);
      if (ticket.current !== n) return;
      if (r.ok) setReport(r.data);else setError(r.message);
    } catch {
      if (ticket.current === n) setError('تعذر الاتصال؛ أعد طلب التقرير');
    } finally {
      if (ticket.current === n) setLoading(false);
    }
  }
  function csv() {
    if (!report) return;
    const rows = [['من', report.from, 'إلى', report.to, 'العملة', report.currency], ['الرمز', 'الحساب', 'افتتاحي', 'مدين', 'دائن', 'ختامي'], ...report.balances.map(b => [b.code, b.name, b.opening, b.debit, b.credit, b.closing])];
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(financeCsvCell).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-balance-${report.from}-${report.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return <section className={styles.panel}>
    <h2>الأستاذ وميزان المراجعة</h2>
    <form className={styles.filters} onSubmit={e => {
      e.preventDefault();
      void load();
    }}>
      <label>
        من
        <input type="date" required value={from} onChange={e => {
          ticket.current++;
          setLoading(false);
          setReport(null);
          setError('');
          setFrom(e.target.value);
        }} />
      </label>
      <label>
        إلى
        <input type="date" required value={to} min={from} onChange={e => {
          ticket.current++;
          setLoading(false);
          setReport(null);
          setError('');
          setTo(e.target.value);
        }} />
      </label>
      <label>
        الحساب
        <select value={accountId} onChange={e => {
          ticket.current++;
          setLoading(false);
          setReport(null);
          setError('');
          setAccountId(e.target.value);
        }}>
          <option value="">كل الحسابات</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
      </label>
      <button disabled={loading}>عرض التقرير</button>
    </form>
    {error && <p role="alert">
      {error}
      <button onClick={() => {
        void load();
      }}>إعادة المحاولة</button>
    </p>}
    {loading && <p role="status">جار إعداد التقرير</p>}
    {report && <><div className={styles.bar}>
        <p>النتيجة المعروضة: {report.from} ← {report.to} · {report.currency}</p>
        <button onClick={csv}>تصدير ميزان المراجعة المعروض</button>
      </div><div className={styles.tableScroll}>
        <table>
          <caption>الأرصدة والحركات حتى نهاية الفترة بتوقيت الرياض</caption>
          <thead>
            <tr>
              <th>الحساب</th>
              <th>افتتاحي</th>
              <th>مدين</th>
              <th>دائن</th>
              <th>ختامي</th>
            </tr>
          </thead>
          <tbody>{report.balances.map(b => <tr key={b.id}>
              <td>{b.code} · {b.name}</td>
              <td>{ledgerAmount(b.opening)}</td>
              <td>{ledgerAmount(b.debit)}</td>
              <td>{ledgerAmount(b.credit)}</td>
              <td>{ledgerAmount(b.closing)}</td>
            </tr>)}</tbody>
        </table>
      </div><div className={styles.tableScroll}>
        <table>
          <caption>قيود الأستاذ التفصيلية</caption>
          <thead>
            <tr>
              <th>المستند</th>
              <th>التاريخ</th>
              <th>الحساب</th>
              <th>مدين</th>
              <th>دائن</th>
            </tr>
          </thead>
          <tbody>{report.entries.map(e => <tr key={e.id}>
              <td>
                <button onClick={() => open(e.document_id)}>مستند {e.number}</button>
              </td>
              <td>{new Date(e.created_at).toLocaleDateString('ar-SA')}</td>
              <td>{e.account_name}</td>
              <td>{ledgerAmount(e.debit)}</td>
              <td>{ledgerAmount(e.credit)}</td>
            </tr>)}</tbody>
        </table>
      </div><div className={styles.bar}>
        <button disabled={loading || report.offset === 0} onClick={() => {
          void load(Math.max(0, report.offset - 100), report);
        }}>السابق</button>
        <span>صفحة {Math.floor(report.offset / 100) + 1}</span>
        <button disabled={loading || !report.hasMore} onClick={() => {
          void load(report.offset + 100, report);
        }}>التالي</button>
      </div></>}
  </section>;
}
