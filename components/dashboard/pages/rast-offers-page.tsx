"use client";

import { useRef, useState } from "react";
import { CalendarDays, ImagePlus, Loader2, Plus, Tag, Ticket, Trash2 } from "lucide-react";
import { deleteOfferAction, fetchOwnerOffersAction, saveOfferAction, uploadOfferBannerAction } from "@/app/actions/offers";
import { RastSpotlight } from "@/components/menu/rast-spotlight";
import { rastCampaignSchema, rastOfferKind } from "@/lib/offers/rast-offers";
import type { CafeOffer, OfferRules, OfferStatus } from "@/lib/mock/offers";
import type { MenuProduct } from "@/lib/mock/menu";
import type { StandaloneHighlight, StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import s from "./rast-offers-page.module.css";

const kinds = [
  { id: "products", title: "خصم على منتجات", detail: "منتج واحد أو تشكيلة تتبدّل", icon: Tag },
  { id: "general", title: "خصم على الكل", detail: "قسيمة تشمل المنيو كاملًا", icon: Ticket },
  { id: "event", title: "إعلان فعالية", detail: "دعوة لموعد يستاهل الزيارة", icon: CalendarDays },
] as const;

function newDraft(): CafeOffer {
  return { id: "new", title: "", description: "", type: "خصم", status: "مسودة", visibleInCafe: true, placement: "بانر الكوفي", discountPercent: 15,
    offerRules: { rastKind: "products", selectedProductIds: [], appliesToAllProducts: false } };
}

function editable(offer: CafeOffer): CafeOffer {
  const kind = rastOfferKind(offer);
  return { ...offer, status: (offer.status as string) === "غير نشط" ? "متوقف" : offer.status,
    offerRules: { ...offer.offerRules, rastKind: kind, selectedProductIds: offer.offerRules?.selectedProductIds ?? (offer.linkedProductId ? [offer.linkedProductId] : []), appliesToAllProducts: kind === "general" } };
}

export function RastOffersPage({ initialOffers, products, brandName, slug }: { initialOffers: CafeOffer[]; products: MenuProduct[]; brandName: string; slug: string }) {
  const [offers, setOffers] = useState(initialOffers);
  const [draft, setDraft] = useState<CafeOffer>(() => initialOffers[0] ? editable(initialOffers[0]) : newDraft());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const mutationPending = useRef(false);
  const kind = rastOfferKind(draft);
  const rules = draft.offerRules ?? {};
  const selected = rules.selectedProductIds ?? [];
  const persisted = /^[0-9a-f-]{36}$/i.test(draft.id);

  function update(patch: Partial<CafeOffer>) { setDraft((value) => ({ ...value, ...patch })); setDirty(true); setMessage(""); setError(""); }
  function updateRules(patch: Partial<OfferRules>) { update({ offerRules: { ...rules, ...patch } }); }
  function changeDraft(next: CafeOffer) {
    if (dirty && !window.confirm("لديك تعديلات غير محفوظة هل تريد تركها؟")) return;
    setDraft(next); setDirty(false); setMessage(""); setError("");
  }
  function remember(saved: CafeOffer) {
    setOffers((current) => [saved, ...current.filter((offer) => offer.id !== saved.id)]);
    setDraft(editable(saved)); setDirty(false);
  }
  async function save() {
    if (mutationPending.current) return;
    const parsed = rastCampaignSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "راجع بيانات البطاقة"); return; }
    mutationPending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const saved = await saveOfferAction({ ...draft, type: kind === "event" ? "عرض مخصص" : "خصم", targetType: kind === "event" ? "experience_campaign" : "products", linkedProductId: kind === "products" ? selected[0] : undefined });
      remember({ ...saved, bannerImageUrl: draft.bannerImageUrl });
      setMessage(saved.status === "مسودة" ? "حُفظت المسودة اختر نشط ثم احفظ لنشر البطاقة" : saved.visibleInCafe && ["نشط", "مجدول"].includes(saved.status) ? "تم حفظ البطاقة تظهر في المنيو ضمن مواعيد النشر المحددة" : "تم حفظ البطاقة وإخفاؤها من المنيو");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر الحفظ بقيت تعديلاتك كما هي"); }
    finally { mutationPending.current = false; setBusy(false); }
  }
  async function upload(file?: File) {
    if (mutationPending.current) return;
    if (!file) return;
    if (!persisted || dirty) { setError("احفظ تعديلات البطاقة أولًا ثم ارفع الصورة"); return; }
    if (file.size > 8 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("اختر صورة بصيغة مناسبة وحجم أقل من ٨ ميجابايت"); return; }
    mutationPending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.set("file", file);
      const uploaded = await uploadOfferBannerAction(draft.id, form);
      const saved = await saveOfferAction({ ...draft, bannerAssetId: uploaded.storagePath, cardStoragePath: undefined });
      remember(saved);
      const refreshed = await fetchOwnerOffersAction(); setOffers(refreshed);
      setDraft(editable(refreshed.find((offer) => offer.id === saved.id) ?? saved));
      setMessage("تم حفظ الصورة وتحديث البطاقة");
    } catch { setError("تعذر تحديث معاينة الصورة أعد تحميل الصفحة للتحقق أو حاول مرة أخرى"); }
    finally { mutationPending.current = false; setBusy(false); }
  }
  async function remove() {
    if (mutationPending.current) return;
    mutationPending.current = true; setBusy(true); setError("");
    try {
      await deleteOfferAction(draft.id); setOffers((value) => value.filter((offer) => offer.id !== draft.id));
      setDraft(newDraft()); setDirty(false); dialog.current?.close(); setMessage("حُذفت البطاقة من المنيو");
    } catch { setError("تعذر حذف البطاقة حاول مرة أخرى"); dialog.current?.close(); }
    finally { mutationPending.current = false; setBusy(false); }
  }

  const previewProducts: StandaloneMenuProduct[] = products.map((product) => ({ ...product, images: product.imageDataUrl ? [{ url: product.imageDataUrl, alt: product.name }] : [], videos: [] }));
  const previewItems: StandaloneHighlight[] = (kind === "products" && selected.length ? selected : [null]).map((id, index) => {
    const product = products.find((value) => value.id === id);
    return { id: `${draft.id}-${index}`, kind, title: draft.title, description: draft.description,
      productId: id, productName: product?.name, imageUrl: (selected.length > 1 ? product?.imageDataUrl : draft.bannerImageUrl || product?.imageDataUrl) ?? null,
      discountPercent: kind === "event" ? null : draft.discountPercent ?? null, code: kind === "event" ? null : draft.code ?? null, expiresAt: null,
      eventDate: rules.eventDate, eventTime: rules.eventTime, eventLocation: rules.eventLocation };
  });

  return <div className={s.page}>
    <header className={s.header}>
      <div><span className={s.eyebrow}>{brandName}</span><h1>العروض والخصومات</h1><p>عروض علامتك وفعالياتها في بطاقات تظهر على المنيو المستقل</p></div>
      <button className={s.primary} type="button" disabled={busy} onClick={() => changeDraft(newDraft())}><Plus aria-hidden="true" />بطاقة جديدة</button>
    </header>
    {error && <p className={s.error} role="alert">{error}</p>}
    {message && <p className={s.success} role="status">{message}</p>}
    <div className={s.workspace}>
      <aside className={s.library} aria-label="بطاقات العروض">
        <div className={s.libraryHeading}><h2>بطاقاتك</h2><span>{offers.length}</span></div>
        <p className={s.hint}>تظهر البطاقات المنشورة ضمن عروض المنيو بتصميم علامتك</p>
        {offers.map((offer) => <button key={offer.id} disabled={busy} type="button" className={s.libraryItem} aria-pressed={offer.id === draft.id} onClick={() => changeDraft(editable(offer))}>
          <span>{kinds.find((item) => item.id === rastOfferKind(offer))?.title}</span><strong>{offer.title}</strong>
          <small>{offer.visibleInCafe ? (offer.status as string) === "غير نشط" ? "متوقف" : offer.status : "مخفي"}</small>
        </button>)}
        {!offers.length && <p className={s.empty}>ابدأ بأول عرض أو فعالية<br />احفظ البطاقة كمسودة حتى تكون جاهزة للنشر</p>}
        <a className={s.menuLink} href={`/menu/${slug}`} target="_blank" rel="noreferrer">افتح منيو {brandName} ↗</a>
      </aside>
      <div className={s.editor}>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy} className={s.fields}>
            <legend className={s.srOnly}>محرر بطاقة العرض</legend>
            <div className={s.editorHeading}><h2>{persisted ? "تعديل البطاقة" : "عرض جديد لعلامتك"}</h2><span>{dirty ? "تعديلات غير محفوظة" : "بطاقة تستاهل التجربة"}</span></div>
            <div className={s.kinds} role="group" aria-label="نوع البطاقة">{kinds.map((item) => <button type="button" key={item.id} aria-pressed={kind === item.id} onClick={() => updateRules({ rastKind: item.id, appliesToAllProducts: item.id === "general" })}><item.icon aria-hidden="true" /><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>
            <div className={s.formGrid}>
              <label className={s.full}>عنوان البطاقة<input required maxLength={100} value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder={kind === "event" ? "ليلة مختلفة تستحق الزيارة" : "اختيارك اليوم له عرض"} /></label>
              <label className={s.full}>التفاصيل<textarea required maxLength={700} rows={3} value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="اكتب التفاصيل والشروط التي يحتاجها الزائر" /></label>
              {kind !== "event" && <><label>نسبة الخصم ٪<input required type="number" min="0.01" max="100" step="0.01" value={draft.discountPercent ?? ""} onChange={(e) => update({ discountPercent: e.target.value === "" ? undefined : Number(e.target.value) })} /></label><label>كود العرض <small>اختياري</small><input dir="ltr" maxLength={40} value={draft.code ?? ""} onChange={(e) => update({ code: e.target.value })} placeholder="WELCOME20" /></label></>}
              {kind === "event" && <><label>تاريخ الفعالية<input required type="date" value={rules.eventDate ?? ""} onChange={(e) => updateRules({ eventDate: e.target.value || undefined })} /></label><label>وقت الفعالية <small>بتوقيت السعودية</small><input required type="time" value={rules.eventTime ?? ""} onChange={(e) => updateRules({ eventTime: e.target.value || undefined })} /></label><label className={s.full}>مكان الفعالية<input required maxLength={160} value={rules.eventLocation ?? ""} onChange={(e) => updateRules({ eventLocation: e.target.value })} placeholder="اسم الفرع أو الموقع" /></label></>}
            </div>
            {kind === "products" && <fieldset className={s.products}><legend>المنتجات المشمولة <span>({selected.length} / 24)</span></legend>
              <label className={s.search}>ابحث عن منتج<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم المنتج" /></label>
              <div className={s.productList}>{products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())).map((product) => <label key={product.id}>
                <input type="checkbox" checked={selected.includes(product.id)} disabled={!selected.includes(product.id) && selected.length >= 24} onChange={(e) => updateRules({ selectedProductIds: e.target.checked ? [...selected, product.id] : selected.filter((id) => id !== product.id) })} />
                <span>{product.name}<small>{product.available ? `${product.price} ريال` : "غير متاح حاليًا لن يظهر في البطاقة"}</small></span>
              </label>)}</div>
              {!products.length && <p className={s.hint}>أضف منتجاتك إلى المنيو أولًا</p>}
              <p className={s.hint}>عند اختيار أكثر من منتج يظهر كل منتج بصورته وسعره ضمن العروض</p>
            </fieldset>}
            {kind === "general" && <p className={s.note}>ستظهر نسبة الخصم بتصميم قسيمة مميزة مع عبارة «على المنيو كاملًا»</p>}
            <fieldset className={s.schedule}><legend>متى تظهر البطاقة؟</legend><div className={s.formGrid}>
              <label>الحالة<select value={draft.status} onChange={(e) => update({ status: e.target.value as OfferStatus })}>{["مسودة", "نشط", "مجدول", "متوقف", "منتهي"].map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className={s.visibility}><input type="checkbox" checked={draft.visibleInCafe} onChange={(e) => update({ visibleInCafe: e.target.checked })} />إظهار في المنيو</label>
              <label>بداية الإعلان <small>اختياري</small><input type="date" value={draft.startDate ?? ""} onChange={(e) => update({ startDate: e.target.value || undefined })} /></label>
              <label>نهاية الإعلان <small>اختياري</small><input type="date" min={draft.startDate} value={draft.endDate ?? ""} onChange={(e) => update({ endDate: e.target.value || undefined })} /></label>
            </div><p className={s.hint}>التواريخ بتوقيت السعودية وتشمل يوم النهاية كاملًا{kind === "event" ? " ويختفي إعلان الفعالية بعد يوم إقامتها" : ""}</p></fieldset>
            {kind !== "general" && <div className={s.upload}><label><ImagePlus aria-hidden="true" />{draft.bannerAssetId || draft.cardStoragePath ? "تغيير صورة البطاقة" : "إضافة صورة للبطاقة"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!persisted || dirty || busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label><p className={s.hint}>{!persisted || dirty ? "احفظ البطاقة أولًا لتتمكن من رفع صورة" : "حتى ٨ ميجابايت الصورة اختيارية؛ المنتجات تستخدم صور المنيو"}</p>
              {(draft.bannerAssetId || draft.cardStoragePath) && <button type="button" className={s.textButton} onClick={() => update({ bannerAssetId: undefined, cardStoragePath: undefined, bannerImageUrl: undefined })}>إزالة الصورة من البطاقة</button>}
            </div>}
            <div className={s.saveBar}><button className={s.primary} type="submit">{busy && <Loader2 className={s.spinner} aria-hidden="true" />}حفظ البطاقة</button>{persisted && <button className={s.delete} type="button" onClick={() => dialog.current?.showModal()}><Trash2 aria-hidden="true" />حذف</button>}</div>
          </fieldset>
        </form>
        <section className={s.preview} aria-label="معاينة البطاقة"><div className={s.previewHeading}><h2>قبل ما يشوفها الكل</h2><span>معاينة المحتوى قبل الحفظ ويظهر بتصميم المنيو الخاص بعلامتك</span></div>
          <RastSpotlight preview menu={{ name: brandName, slug, logoUrl: null, description: null, products: previewProducts, categories: [], contacts: { feedbackEnabled: false, instagramUrl: null, location: null }, highlights: { asOf: 0, items: previewItems } }} onSelect={() => {}} />
        </section>
      </div>
    </div>
    <dialog ref={dialog} className={s.dialog} aria-labelledby="delete-offer-card" onCancel={(e) => { if (busy) e.preventDefault(); }}><h2 id="delete-offer-card">حذف البطاقة؟</h2><p>ستختفي «{draft.title}» من المنيو</p><div><button autoFocus type="button" disabled={busy} onClick={() => dialog.current?.close()}>إلغاء</button><button className={s.delete} type="button" disabled={busy} onClick={() => void remove()}>تأكيد الحذف</button></div></dialog>
  </div>;
}
