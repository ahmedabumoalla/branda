"use client";

import { prepareLoyaltyLogoAction } from "@/app/actions/loyalty-logo";
import { useState, type FormEvent } from "react";
import { MapPin, Plus, Save, Store } from "lucide-react";
import { saveLoyaltyBranchAction, assignLoyaltyCashierBranchAction } from "@/app/actions/loyalty-branches";
import { branchEnrollmentPath, type LoyaltyBranch, type LoyaltyBranchesDashboard } from "@/lib/loyalty/branch-types";
import { RastQrCode } from "@/components/rast-loyalty/qr-code";
import styles from "./loyalty-branches.module.css";

const newBranch = (): LoyaltyBranch => ({ id: crypto.randomUUID(), name: "", active: true, enabled: false, updatedAt: "", address: "", latitude: null, longitude: null, nearbyMessage: "", logo: null, banner: null, background: "#171717", foreground: "#ffffff", accent: "#ff7900" });

async function imageData(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("اختر صورة PNG أو JPG أو WebP لا تتجاوز 5 ميجابايت");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas"), scale = Math.min(1, 1125 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("تعذر قراءة الصورة");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const value = canvas.toDataURL("image/webp", .85);
    if (value.length > 700_000) throw new Error("حجم الصورة كبير اختر صورة أصغر");
    return value;
  } finally { bitmap.close(); }
}

export function LoyaltyBranches({ initial, error }: { initial: LoyaltyBranchesDashboard; error?: string }) {
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState<LoyaltyBranch | null>(null);
  const [mapsUrl, setMapsUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const patch = (value: Partial<LoyaltyBranch>) => setEditing(current => current ? { ...current, ...value } : current);
  async function upload(file: File | undefined, key: "logo" | "banner") {
    if (!file || busy) return;
    setBusy(true); setNotice(null);
    try {
      if (key === "logo") {
        const form = new FormData(); form.set("file", file);
        const result = await prepareLoyaltyLogoAction(form, "loyalty");
        patch({ logo: result.dataUrl, background: result.palette.primary, foreground: result.palette.text, accent: result.palette.secondary });
        setNotice({ text: "تم تجهيز الشعار وألوان البطاقة راجع المعاينة ثم احفظ" });
      } else patch({ banner: await imageData(file) });
    }
    catch (cause) { setNotice({ text: cause instanceof Error ? cause.message : "تعذر تجهيز الصورة", error: true }); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return;
    setBusy(true); setNotice(null);
    try {
      const result = await saveLoyaltyBranchAction({ ...editing, expectedUpdatedAt: editing.updatedAt || null, ...(mapsUrl.trim() ? { mapsUrl } : {}) });
      if (!result.ok) { setNotice({ text: result.message, error: true }); return; }
      setData(result.data); setEditing(null); setNotice({ text: "تم حفظ الفرع وهويته" });
    } catch { setNotice({ text: "تعذر الاتصال بقيت تعديلاتك هنا حاول مرة أخرى", error: true }); }
    finally { setBusy(false); }
  }
  async function assign(cashier: string, branch: string) {
    if (busy) return; setBusy(true); setNotice(null);
    try { const result = await assignLoyaltyCashierBranchAction(cashier, branch || null); if (result.ok) { setData(result.data); setNotice({ text: "تم تحديث فرع الكاشير" }); } else setNotice({ text: result.message, error: true }); }
    catch { setNotice({ text: "تعذر حفظ فرع الكاشير حاول مرة أخرى", error: true }); }
    finally { setBusy(false); }
  }
  return <div className={styles.page} dir="rtl">
    <header className={styles.header}><div><span>{data.brandName} · الولاء</span><h1>فروع الولاء</h1><p>شعار وموقع لكل فرع ورصيد وأختام مشتركة بين الفروع</p></div><button className={styles.primary} disabled={busy || Boolean(error)} onClick={() => { setEditing(newBranch()); setMapsUrl(""); setNotice(null); }}><Plus size={18} />إضافة فرع</button></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? styles.error : styles.success}>{notice.text}</p>}
    {editing && <form className={styles.editor} onSubmit={save}>
      <fieldset disabled={busy}><legend>{editing.updatedAt ? "تعديل الفرع" : "فرع جديد"}</legend>
        <div className={styles.fields}>
          <label>اسم الفرع<input required maxLength={120} value={editing.name} onChange={e => patch({ name: e.target.value })} /></label>
          <label>العنوان<input maxLength={300} value={editing.address} onChange={e => patch({ address: e.target.value })} /></label>
          <label className={styles.wide}>رابط الموقع على خرائط Google<input dir="ltr" type="url" value={mapsUrl} placeholder="https://maps.app.goo.gl/..." onChange={e => setMapsUrl(e.target.value)} /><small>يستخرج النظام إحداثيات الموقع عند الحفظ ويمكن إدخالها مباشرة بالأسفل</small></label>
          <label>خط العرض<input type="number" dir="ltr" min={-90} max={90} step="any" value={editing.latitude ?? ""} onChange={e => patch({ latitude: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label>خط الطول<input type="number" dir="ltr" min={-180} max={180} step="any" value={editing.longitude ?? ""} onChange={e => patch({ longitude: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label className={styles.wide}>رسالة القرب من الفرع<input maxLength={240} value={editing.nearbyMessage} onChange={e => patch({ nearbyMessage: e.target.value })} placeholder="أهلًا بك في فرعنا بطاقتك جاهزة لزيارتك" /></label>
          <label>شعار الفرع<input type="file" accept="image/*,.svg,.tif,.tiff,.avif" onChange={e => void upload(e.target.files?.[0], "logo")} /><small>يظهر على البطاقة وإشعارات المحفظة الخاصة بها</small></label>
          <label>صورة البطاقة<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void upload(e.target.files?.[0], "banner")} /><small>يفضل تصميم أفقي بنسبة 1125 × 432 دون باركود أو رصيد ثابت</small>{editing.banner && <button type="button" className={styles.secondary} onClick={() => patch({ banner: null })}>إزالة الصورة</button>}</label>
          <div className={`${styles.colors} ${styles.wide}`}>{([["background", "الخلفية"], ["foreground", "النص"], ["accent", "لون الهوية"]] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={editing[key]} onChange={e => patch({ [key]: e.target.value })} /></label>)}</div>
          <label className={styles.check}><input type="checkbox" checked={editing.active} onChange={e => patch({ active: e.target.checked })} />الفرع نشط</label>
          <label className={styles.check}><input type="checkbox" checked={editing.enabled} onChange={e => patch({ enabled: e.target.checked })} />تفعيل بطاقة الفرع والتسجيل</label>
        </div>
        <p className={styles.hint}>ظهور البطاقة عند الاقتراب يعتمد على صلاحيات الموقع وإعدادات المحفظة في جهاز العميل</p>
        <div className={styles.actions}><button className={styles.primary} type="submit"><Save size={17} />{busy ? "جار الحفظ" : "حفظ الفرع"}</button><button className={styles.secondary} type="button" onClick={() => setEditing(null)}>إلغاء</button></div>
      </fieldset>
      <aside className={styles.preview}><h2>معاينة هوية البطاقة</h2><div className={styles.wallet} style={{ background: editing.background, color: editing.foreground }}>
        <div className={styles.walletHeader}>{editing.logo ? <img src={editing.logo} alt="شعار الفرع" /> : <Store aria-hidden="true" />}<strong>{editing.name || "اسم الفرع"}</strong></div>
        {editing.banner ? <img className={styles.banner} src={editing.banner} alt="صورة البطاقة" /> : <div className={styles.bannerPlaceholder} style={{ color: editing.accent }}>بطاقتك بهوية فرعك</div>}
        <div className={styles.nativeFields}><span>اسم العميل<strong>معاينة</strong></span><span>رصيد الأختام<strong>يظهر رصيد العميل</strong></span></div>
        <p>رمز العميل يظهر بعد إصدار البطاقة</p>
      </div><p className={styles.hint}>معاينة للهوية والألوان يختلف ترتيب الحقول قليلًا بين محفظة آبل وجوجل</p></aside>
    </form>}
    {!editing && !data.branches.length && !error && <section className={styles.empty}><Store size={34} /><h2>ابدأ بإضافة أول فرع</h2><p>أضف شعاره وموقعه ثم اربط الكاشير به ليصدر بطاقات الفرع</p></section>}
    <div className={styles.branchGrid}>{data.branches.map(branch => {
      const path = branchEnrollmentPath(data.slug, branch.id), link = `https://barndaksa.com${path}`, ready = branch.active && branch.enabled;
      return <article className={styles.branch} key={branch.id}>
        <div className={styles.branchHeading}>{branch.logo ? <img src={branch.logo} alt="" /> : <Store />}<div><h2>{branch.name}</h2><span>{ready ? "التسجيل متاح" : "التسجيل متوقف"}</span></div></div>
        <p><MapPin size={16} />{branch.latitude === null ? "الموقع لم يحدد بعد" : branch.address || "موقع الفرع محفوظ"}</p>
        {branch.latitude !== null && branch.longitude !== null && <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${branch.latitude},${branch.longitude}`}>عرض الموقع</a>}
        {ready ? <div className={styles.qr}><RastQrCode value={link} label={`باركود ولاء ${branch.name}`} /><a href={path} target="_blank" rel="noreferrer">فتح بطاقة الفرع</a><button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(link).then(() => setNotice({ text: "تم نسخ رابط الفرع" })).catch(() => setNotice({ text: "تعذر النسخ افتح رابط الفرع وانسخه", error: true }))}>نسخ رابط الفرع</button></div> : <p className={styles.hint}>أكمل الشعار وفعل بطاقة الفرع لإظهار الباركود</p>}
        <button className={styles.secondary} disabled={busy} onClick={() => { setEditing({ ...branch }); setMapsUrl(""); setNotice(null); }}>تعديل الهوية والموقع</button>
      </article>;
    })}</div>
    <section className={styles.cashiers}><h2>ربط الكاشير بالفروع</h2><p>البطاقات الجديدة الصادرة من الكاشير تحمل شعار الفرع المحدد هنا</p>{!data.cashiers.length && <p>أضف الكاشير من إدارة الكاشير ثم اربطه بفرعه هنا</p>}
      {data.cashiers.map(cashier => <label key={cashier.id} className={styles.cashier}><span>{cashier.name}<small>{cashier.active ? "نشط" : "متوقف"}</small></span><select disabled={busy || Boolean(error)} value={cashier.branchId ?? ""} onChange={e => void assign(cashier.id, e.target.value)}><option value="">غير مرتبط بفرع</option>{data.branches.filter(b => b.active && b.enabled || b.id === cashier.branchId).map(b => <option key={b.id} value={b.id} disabled={!b.active || !b.enabled}>{b.name}{!b.active || !b.enabled ? " — متوقف" : ""}</option>)}</select></label>)}
    </section>
  </div>;
}
