'use client';
import { useEffect, useState } from 'react';
import { getCustomerForms } from '@/app/actions/erp-customer-forms';
import type { CustomerFormsSnapshot } from '@/lib/erp/customer-forms';
import type { CustomerSnapshot } from '@/lib/erp/customers';
import { CustomerFormSettings, CustomerRecordForms } from './customer-forms';
import s from './customers.module.css';

export function CustomerFormsPanel({ snapshot, recordId }: { snapshot: CustomerSnapshot; recordId?: string }) {
  const [result, setResult] = useState<{ key: string; data: CustomerFormsSnapshot | null; error: string } | null>(null);
  const [version, setVersion] = useState(0);
  const slug = snapshot.slug;
  const key = `${slug}/${recordId ?? ''}/${version}`;
  useEffect(() => {
    let active = true;
    getCustomerForms(slug, recordId).then(response => {
      if (!active) return;
      setResult({ key, data: response.ok ? response.data : null, error: response.ok ? '' : response.message });
    }).catch(() => { if (active) setResult({ key, data: null, error: 'تعذر تحميل نماذج العملاء' }); });
    return () => { active = false; };
  }, [slug, recordId, key]);
  if (result?.key !== key) return <p role="status">جار تحميل نماذج العملاء</p>;
  const { data, error } = result;
  if (error || !data) return <div className={s.error} role="alert">{error || 'تعذر تحميل نماذج العملاء'}<button className={s.button} onClick={() => setVersion(value => value + 1)}>إعادة المحاولة</button></div>;
  const context = { slug, customers: snapshot.customers, users: snapshot.users, forms: data, onSaved: () => setVersion(value => value + 1) };
  return recordId ? <CustomerRecordForms key={recordId + ':' + version} snapshot={context} recordId={recordId} targetKind="customers" /> : <>
    <CustomerFormSettings key={'primary:' + version} snapshot={context} targetKind="customers" kind="primary" />
    <CustomerFormSettings key={'related:' + version} snapshot={context} targetKind="customers" kind="related" />
  </>;
}
