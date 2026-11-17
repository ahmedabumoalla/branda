"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ExternalLink, MapPin, Navigation, Pencil, Plus, Store, X } from "lucide-react";
import type { MenuBranch } from "@/lib/data/menu-branches";
import { saveMenuBranchAction, setMenuBranchSourceAction, resolveMenuBranchLocationAction } from "@/app/actions/menu-branches";
import { MAX_WALLET_LOCATIONS, selectBranchWalletLocations, validWalletCoordinates } from "@/lib/wallet/branch-locations";
import { DashboardPageShell } from "@/components/ui/design-system";
import styles from "./branch-menus-page.module.css";

type Draft = { id: string; expectedUpdatedAt: string | null; name: string; address: string; city: string; lat: string; lng: string; welcomeMessage: string; active: boolean; root: boolean };
function errorMessage(error: unknown, fallback: string) { return error instanceof Error && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 240 ? error.message : fallback; }
function coordinate(value: string) { return Number(value.trim().replace(/[٠-٩]/g, char => String("٠١٢٣٤٥٦٧٨٩".indexOf(char))).replace("٫", ".")); }

export function BranchMenusPage({ branches, slug, configError }: { branches: MenuBranch[]; slug: string; configError?: string }) {
  const [rows, setRows] = useState(branches), [draft, setDraft] = useState<Draft | null>(null);
  const [mapUrl, setMapUrl] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null), [locating, setLocating] = useState(false);
  const mutation = useRef(false), locationPending = useRef(false), locationRequest = useRef(0);
  const nameInput = useRef<HTMLInputElement>(null), errorPanel = useRef<HTMLParagraphElement>(null);
  useEffect(() => { setRows(branches); }, [branches]);
  useEffect(() => { if (draft) nameInput.current?.focus(); }, [draft?.id]);
  useEffect(() => { if (error) errorPanel.current?.focus(); }, [error]);
  useEffect(() => () => { locationRequest.current++; }, []);
  const coverage = selectBranchWalletLocations(rows);
  function update(field: keyof Draft, value: string | boolean) { setDraft(current => current ? { ...current, [field]: value } : current); }
  function resetLocation() { locationRequest.current++; locationPending.current = false; setLocating(false); }
  function openForm(branch?: MenuBranch) {
    if (mutation.current || configError || draft) return;
    resetLocation(); setMapUrl(""); setError(""); setNotice("");
    setDraft(branch ? { id: branch.id, expectedUpdatedAt: branch.updatedAt, name: branch.name, address: branch.address, city: branch.city, lat: branch.lat === null ? "" : String(branch.lat), lng: branch.lng === null ? "" : String(branch.lng), welcomeMessage: branch.welcomeMessage, active: branch.active, root: branch.brandMenuRoot } : { id: crypto.randomUUID(), expectedUpdatedAt: null, name: "", address: "", city: "", lat: "", lng: "", welcomeMessage: "", active: true, root: false });
  }
  function closeForm() { if (mutation.current) return; resetLocation(); setDraft(null); setError(""); }
  function replaceBranch(branch: MenuBranch) { setRows(current => current.some(row => row.id === branch.id) ? current.map(row => row.id === branch.id ? branch : row) : [...current, branch]); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft || mutation.current || locationPending.current || configError) return;
    setError(""); setNotice("");
    if (!draft.name.trim()) { setError("أدخل اسم الفرع"); return; }
    if (Boolean(draft.lat.trim()) !== Boolean(draft.lng.trim())) { setError("أدخل خط العرض وخط الطول معًا أو اترك الموقع فارغًا"); return; }
    const lat = draft.lat.trim() ? coordinate(draft.lat) : null, lng = draft.lng.trim() ? coordinate(draft.lng) : null;
    if (lat !== null && !validWalletCoordinates(lat, lng)) { setError("تحقق من الإحداثيات خط العرض بين ٩٠- و٩٠ وخط الطول بين ١٨٠- و١٨٠"); return; }
    mutation.current = true; setBusy(draft.id);
    try {
      const saved = await saveMenuBranchAction({ id: draft.id, expectedUpdatedAt: draft.expectedUpdatedAt, name: draft.name.trim(), address: draft.address.trim(), city: draft.city.trim(), lat, lng, welcomeMessage: draft.welcomeMessage.trim(), active: draft.active });
      replaceBranch(saved); resetLocation(); setDraft(null); setNotice("تم حفظ الفرع وبياناته");
    } catch (cause) { setError(errorMessage(cause, "تعذر حفظ الفرع أعد المحاولة وستبقى بياناتك محفوظة في النموذج")); }
    finally { mutation.current = false; setBusy(null); }
  }
  async function changeMenuSource(branch: MenuBranch) {
    if (mutation.current || branch.brandMenuRoot || configError || draft) return;
    mutation.current = true; setBusy(branch.id); setError(""); setNotice("");
    try {
      const saved = await setMenuBranchSourceAction({ id: branch.id, expectedUpdatedAt: branch.updatedAt, usesBrandMenu: !branch.usesBrandMenu });
      replaceBranch(saved); setNotice(saved.usesBrandMenu ? "تم اعتماد المنيو الأساسي للعلامة وتحديثاته ستظهر في هذا الفرع تلقائيًا" : "تم تفعيل منيو الفرع المستقل مع الاحتفاظ بأصنافه السابقة");
    } catch (cause) { setError(errorMessage(cause, "تعذر تحديث مصدر المنيو أعد المحاولة")); }
    finally { mutation.current = false; setBusy(null); }
  }
  async function resolveLocation() {
    if (!draft || locationPending.current || mutation.current) return;
    if (!mapUrl.trim()) { setError("ألصق رابط الموقع من خرائط Google أولًا"); return; }
    const request = ++locationRequest.current; locationPending.current = true; setLocating(true); setError(""); setNotice("");
    try {
      const result = await resolveMenuBranchLocationAction(mapUrl.trim());
      if (request !== locationRequest.current) return;
      if (!validWalletCoordinates(result.latitude, result.longitude)) { setError("لم نتمكن من قراءة موقع واضح من الرابط أدخل الإحداثيات يدويًا"); return; }
      setDraft(current => current ? { ...current, lat: String(result.latitude), lng: String(result.longitude) } : current);
      setNotice("تم تحديد الموقع راجع الإحداثيات ثم احفظ الفرع");
    } catch (cause) { if (request === locationRequest.current) setError(errorMessage(cause, "تعذر قراءة الرابط أدخل الإحداثيات يدويًا")); }
    finally { if (request === locationRequest.current) { locationPending.current = false; setLocating(false); } }
  }
  function currentLocation() {
    if (!draft || locationPending.current || mutation.current) return;
    if (!navigator.geolocation) { setError("المتصفح لا يدعم تحديد الموقع استخدم رابط الخرائط أو الإحداثيات"); return; }
    const request = ++locationRequest.current; locationPending.current = true; setLocating(true); setError(""); setNotice("");
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest.current) return;
      setDraft(current => current ? { ...current, lat: String(position.coords.latitude), lng: String(position.coords.longitude) } : current);
      locationPending.current = false; setLocating(false); setNotice("تم استخدام موقع جهازك الحالي تأكد أنك داخل الفرع ثم احفظ");
    }, () => { if (request === locationRequest.current) { locationPending.current = false; setLocating(false); setError("تعذر الوصول إلى موقعك استخدم رابط الخرائط أو أدخل الإحداثيات"); } }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  const disabled = Boolean(busy || configError);
  return <DashboardPageShell title="الفروع" subtitle="أضف فروع العلامة وحدد مواقعها والمنيو الخاص بكل فرع"><div className={styles.page} dir="rtl">
    <div className={styles.toolbar}><div><h2>إدارة الفروع</h2><p>{rows.length} فرع · {rows.filter(branch => branch.active).length} فرع نشط</p></div><button type="button" className={styles.primary} onClick={() => openForm()} disabled={disabled || Boolean(draft)}><Plus size={18} aria-hidden="true" />إضافة فرع</button></div>
    {(error || configError) && <p ref={errorPanel} className={styles.error} role="alert" tabIndex={-1}>{error || configError}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <aside className={styles.locationNote}><MapPin size={21} aria-hidden="true" /><div><h3>مواقع الفروع في بطاقات الولاء</h3><p>يمكن أن تظهر بطاقة العميل عند قربه من الفرع إذا حفظها في محفظته وسمح بإشعارات الموقع حسب إعدادات جهازه</p><p>تدعم البطاقة حتى {MAX_WALLET_LOCATIONS} مواقع مختلفة وفق ترتيب الفروع مع أولوية الفرع الرئيسي · المواقع النشطة المحددة {coverage.totalLocations} · المشمولة {coverage.locations.length}</p></div></aside>
    {draft && <section className={styles.editor} aria-labelledby="branch-form-title"><div className={styles.toolbar}><div><p className={styles.eyebrow}>بيانات الفرع</p><h2 id="branch-form-title">{draft.expectedUpdatedAt ? "تعديل الفرع" : "إضافة فرع جديد"}</h2></div><button type="button" className={styles.secondary} onClick={closeForm} disabled={Boolean(busy)} aria-label="إغلاق نموذج الفرع"><X size={18} aria-hidden="true" /></button></div>
      <form onSubmit={save}><fieldset disabled={disabled} className={styles.fieldset}><div className={styles.fields}>
        <label className={styles.field} htmlFor="branch-name">اسم الفرع<input id="branch-name" ref={nameInput} value={draft.name} onChange={event => update("name", event.target.value)} required maxLength={120} autoComplete="organization" /></label>
        <label className={styles.field} htmlFor="branch-city">المدينة<input id="branch-city" value={draft.city} onChange={event => update("city", event.target.value)} maxLength={100} autoComplete="address-level2" /></label>
        <label className={`${styles.field} ${styles.full}`} htmlFor="branch-address">العنوان<input id="branch-address" value={draft.address} onChange={event => update("address", event.target.value)} maxLength={300} autoComplete="street-address" /></label>
      </div><div className={styles.locationEditor}><h3>موقع الفرع</h3><p>ألصق رابط الموقع أو أدخل الإحداثيات يمكنك حفظ الفرع دون موقع وإضافته لاحقًا</p><div className={styles.mapRow}><label className={styles.field} htmlFor="branch-map-url">رابط خرائط Google<input id="branch-map-url" type="url" dir="ltr" value={mapUrl} disabled={locating} onChange={event => setMapUrl(event.target.value)} placeholder="https://maps.google.com/..." /></label><button type="button" className={styles.secondary} onClick={resolveLocation} disabled={locating}>{locating ? "جارٍ تحديد الموقع" : "تحديد الموقع من الرابط"}</button><button type="button" className={styles.secondary} onClick={currentLocation} disabled={locating}><Navigation size={16} aria-hidden="true" />استخدام موقعي الحالي</button></div><div className={styles.fields}>
        <label className={styles.field} htmlFor="branch-lat">خط العرض<input id="branch-lat" dir="ltr" inputMode="decimal" value={draft.lat} onChange={event => update("lat", event.target.value)} disabled={locating} placeholder="24.7136" /></label>
        <label className={styles.field} htmlFor="branch-lng">خط الطول<input id="branch-lng" dir="ltr" inputMode="decimal" value={draft.lng} onChange={event => update("lng", event.target.value)} disabled={locating} placeholder="46.6753" /></label>
        <label className={`${styles.field} ${styles.full}`} htmlFor="branch-welcome">رسالة القرب من الفرع<textarea id="branch-welcome" value={draft.welcomeMessage} onChange={event => update("welcomeMessage", event.target.value)} maxLength={240} rows={2} placeholder="مرحبًا بك يسعدنا استقبال زيارتك للفرع" /><small>تستخدمها المحافظ التي تدعم نص الترحيب عند القرب من الموقع</small></label>
      </div></div><label className={styles.checkbox}><input type="checkbox" checked={draft.active} onChange={event => update("active", event.target.checked)} disabled={draft.root} /><span>الفرع نشط ومنيوه متاح للعملاء</span></label>{draft.root && <p className={styles.hint}>هذا فرع المنيو الأساسي للعلامة ويظل نشطًا</p>}{!draft.expectedUpdatedAt && <p className={styles.hint}>الفرع الجديد يعتمد المنيو الأساسي للعلامة ويمكنك تخصيص منيو مستقل له لاحقًا</p>}<div className={styles.actions}><button type="submit" className={styles.primary} disabled={disabled || locating}><Check size={18} aria-hidden="true" />{busy === draft.id ? "جارٍ حفظ الفرع" : "حفظ الفرع"}</button><button type="button" className={styles.secondary} onClick={closeForm} disabled={Boolean(busy)}>إلغاء</button></div></fieldset></form>
    </section>}
    {!rows.length ? <section className={styles.empty}><Store size={38} aria-hidden="true" /><h2>أضف أول فرع للعلامة</h2><p>حدد موقعه واختر المنيو الذي سيشاهده عملاؤه</p><button type="button" className={styles.primary} onClick={() => openForm()} disabled={disabled || Boolean(draft)}><Plus size={18} aria-hidden="true" />إضافة فرع</button></section> : <div className={styles.cards}>{rows.map(branch => {
      const coordinates = validWalletCoordinates(branch.lat, branch.lng), covered = coverage.coveredBranchIds.includes(branch.id);
      return <article key={branch.id} className={styles.card}><div className={styles.cardHeader}><span className={styles.storeIcon}><Store size={23} aria-hidden="true" /></span><div><h2>{branch.name}</h2><p>{[branch.city, branch.address].filter(Boolean).join(" · ") || "لم يحدد عنوان الفرع بعد"}</p></div><span className={styles.badge} data-active={branch.active}>{branch.active ? "نشط" : "غير نشط"}</span></div>
        <div className={styles.locationStatus}><MapPin size={16} aria-hidden="true" /><span>{!branch.active ? "غير مشمول بالمواقع لأنه غير نشط" : !coordinates ? "أضف الموقع ليشمل الفرع بطاقات الولاء" : covered ? "الموقع مشمول في بطاقات الولاء" : "خارج حد المواقع العشرة لبطاقات الولاء"}</span>{coordinates && <a href={`https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`} target="_blank" rel="noopener noreferrer" aria-label={`عرض موقع ${branch.name} في الخرائط`}><ExternalLink size={16} aria-hidden="true" /></a>}</div>
        <div className={styles.source}><strong>{branch.brandMenuRoot ? "المنيو الأساسي" : branch.usesBrandMenu ? "يعتمد المنيو الأساسي للعلامة" : "منيو مستقل لهذا الفرع"}</strong><p>{branch.brandMenuRoot ? "الأصناف والأسعار التي تعتمدها الفروع المرتبطة" : branch.usesBrandMenu ? "نفس أصناف وأسعار العلامة مع تحديثها تلقائيًا" : "إدارة أصناف وصور وأسعار خاصة بالفرع"}</p></div>
        <div className={styles.actions}><Link className={styles.primary} href={`/dashboard/menu?branch=${encodeURIComponent(branch.id)}`}><Pencil size={16} aria-hidden="true" />إدارة المنيو</Link>{!branch.brandMenuRoot && <button type="button" className={styles.secondary} disabled={disabled || Boolean(draft)} onClick={() => changeMenuSource(branch)}>{busy === branch.id ? "جارٍ تحديث المنيو" : branch.usesBrandMenu ? "استعادة منيو الفرع المستقل" : "اعتماد المنيو الأساسي للعلامة"}</button>}</div>
        <div className={styles.cardFooter}><button type="button" className={styles.textButton} onClick={() => openForm(branch)} disabled={disabled || Boolean(draft)}>تعديل بيانات الفرع</button>{branch.active && branch.slug && slug && <Link href={`/menu/${encodeURIComponent(slug)}?branch=${encodeURIComponent(branch.slug)}`} target="_blank" rel="noopener noreferrer" className={styles.textButton}>استعراض منيو الفرع<ExternalLink size={14} aria-hidden="true" /></Link>}</div>
      </article>;
    })}</div>}
  </div></DashboardPageShell>;
}
