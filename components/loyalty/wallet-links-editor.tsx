"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Link2, Plus, Save, Trash2 } from "lucide-react";
import { saveWalletLinksAction } from "@/app/actions/wallet-links";
import { MAX_WALLET_LINKS, walletLinksSchema, type WalletLink, type WalletLinksState } from "@/lib/loyalty/wallet-links";
import s from "./wallet-links-editor.module.css";

const suggestions = ["إنستغرام", "واتساب", "المنيو", "الموقع", "رابط خاص"];

export function WalletLinksEditor({ initial, brandName }: { initial: WalletLinksState; brandName: string }) {
  const [links, setLinks] = useState(initial.links);
  const [saved, setSaved] = useState(initial.links);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const busy = useRef(false);
  const dirty = JSON.stringify(saved) !== JSON.stringify(links);
  const disabled = saving || !initial.available;

  function change(next: WalletLink[]) {
    setLinks(next);
    setError("");
    setMessage("");
  }

  function add(label: string) {
    if (links.length >= MAX_WALLET_LINKS) return;
    const id = crypto.randomUUID();
    change([...links, { id, label: label === "رابط خاص" ? "" : label, url: "" }]);
    requestAnimationFrame(() => document.getElementById(`wallet-link-${id}-label`)?.focus());
  }

  function move(index: number, offset: number) {
    const next = [...links];
    const target = index + offset;
    if (target < 0 || target >= links.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    change(next);
    requestAnimationFrame(() => document.getElementById(`wallet-link-${next[target].id}-label`)?.focus());
  }

  function fail(value: string) {
    setError(value);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !initial.available || !dirty) return;
    setMessage("");
    const parsed = walletLinksSchema.safeParse(links);
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message || "راجع أسماء الروابط وعناوينها قبل الحفظ");
      return;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await saveWalletLinksAction(parsed.data);
      if (!result.ok) { fail(result.message); return; }
      setLinks(result.links);
      setSaved(result.links);
      setMessage("تم حفظ روابط البطاقة تظهر على البطاقات الجديدة وتتحدث البطاقات المحفوظة عند تحديث المحفظة");
    } catch {
      fail("تعذر حفظ الروابط حاول مرة أخرى");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return <section className={s.section} aria-labelledby="wallet-links-title">
    <header className={s.heading}><Link2 aria-hidden="true" /><div><h2 id="wallet-links-title">روابط البطاقة</h2><p>حسابات التواصل والمنيو وأي رابط يخص {brandName} داخل تفاصيل بطاقة المحفظة</p></div></header>
    {!initial.available ? <p role="status" className={s.notice}>إعداد روابط البطاقة غير متاح حاليًا حاول تحديث الصفحة لاحقًا</p> : <>
      <form onSubmit={submit}>
        <fieldset disabled={disabled} className={s.fields}>
          <legend className={s.srOnly}>تعديل روابط البطاقة</legend>
          <div className={s.suggestions} aria-label="إضافة رابط"><span>أضف رابطًا</span>{suggestions.map(label => <button key={label} type="button" disabled={links.length >= MAX_WALLET_LINKS} onClick={() => add(label)}><Plus size={15} aria-hidden="true" />{label}</button>)}</div>
          <p className={s.hint} id="wallet-links-hint">حتى {MAX_WALLET_LINKS} روابط بالترتيب الذي تختاره استخدم رابطًا يبدأ بـ https أو رابط اتصال مثل tel:+966500000000 أو بريد مثل mailto:hello@example.com</p>
          <p className={s.hint}>أضف رابط المنيو ضمن القائمة إذا أردت ظهوره مع روابطك</p>
          {links.length === 0 && <p className={s.empty}>أضف أول رابط ليصل العميل إلى علامتك من بطاقته</p>}
          <ol className={s.rows}>
            {links.map((link, index) => <li key={link.id} className={s.row}>
              <span className={s.number} aria-label={`الرابط ${index + 1}`}>{index + 1}</span>
              <div className={s.inputs}>
                <label htmlFor={`wallet-link-${link.id}-label`}>اسم الرابط<input id={`wallet-link-${link.id}-label`} value={link.label} required maxLength={60} placeholder="مثل حسابنا في إنستغرام" onChange={event => change(links.map(item => item.id === link.id ? { ...item, label: event.target.value } : item))} /></label>
                <label htmlFor={`wallet-link-${link.id}-url`}>عنوان الرابط<input id={`wallet-link-${link.id}-url`} value={link.url} dir="ltr" required maxLength={2048} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="wallet-links-hint" placeholder="https://" onChange={event => change(links.map(item => item.id === link.id ? { ...item, url: event.target.value } : item))} /></label>
              </div>
              <div className={s.controls}>
                <button type="button" disabled={index === 0} aria-label={`نقل الرابط ${index + 1} للأعلى`} onClick={() => move(index, -1)}><ArrowUp size={17} aria-hidden="true" /></button>
                <button type="button" disabled={index === links.length - 1} aria-label={`نقل الرابط ${index + 1} للأسفل`} onClick={() => move(index, 1)}><ArrowDown size={17} aria-hidden="true" /></button>
                <button type="button" aria-label={`حذف الرابط ${index + 1}`} onClick={() => { change(links.filter(item => item.id !== link.id)); requestAnimationFrame(() => document.getElementById("wallet-links-add")?.focus()); }}><Trash2 size={17} aria-hidden="true" /></button>
              </div>
            </li>)}
          </ol>
          <button id="wallet-links-add" className={s.add} type="button" disabled={links.length >= MAX_WALLET_LINKS} onClick={() => add("رابط خاص")}><Plus size={17} aria-hidden="true" />إضافة رابط خاص <span>{links.length} / {MAX_WALLET_LINKS}</span></button>
          <div className={s.saveBar}><span>{dirty ? "لديك تغييرات لم تُحفظ" : "الروابط خاصة بهذه العلامة"}</span><button className={s.save} type="submit" disabled={!dirty}><Save size={17} aria-hidden="true" />{saving ? "جاري الحفظ" : "حفظ روابط البطاقة"}</button></div>
        </fieldset>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className={s.error}>{error}</p>}
        {message && <p role="status" className={s.success}>{message}</p>}
      </form>
      {links.length > 0 && <div className={s.preview}><h3>معاينة روابط التفاصيل</h3><p>يختلف شكل العرض حسب محفظة العميل</p><ul>{links.map(link => {
        const parsed = walletLinksSchema.safeParse([link]);
        return <li key={link.id}>{parsed.success ? <a href={parsed.data[0].url} target="_blank" rel="noopener noreferrer"><span>{parsed.data[0].label}</span><ExternalLink size={15} aria-hidden="true" /></a> : <span className={s.incomplete}>{link.label || "رابط جديد"}<small>أكمل بيانات الرابط للمعاينة</small></span>}</li>;
      })}</ul></div>}
    </>}
  </section>;
}
