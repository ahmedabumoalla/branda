"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Gift, KeyRound, LoaderCircle, Megaphone, Package, ScanLine, Trash2, UserPlus, UserRound } from "lucide-react";
import { addBrandEmployeeAction, removeBrandEmployeeAction, saveBrandStaffAccessAction } from "@/app/actions/brand-staff";
import type { BrandStaffMember } from "@/lib/staff/brand-staff-server";

type Access = { canLogin: boolean; menu: boolean; messages: boolean; rewards: boolean };
type Notice = { tone: "ok" | "error"; text: string } | null;

const permissionRows: Array<{ key: keyof Omit<Access, "canLogin">; title: string; hint: string; icon: typeof Package }> = [
  { key: "menu", title: "تعديل منتجات المنيو", hint: "إضافة وحذف وتعديل بيانات المنتجات من قسم المنيو والمنتجات", icon: Package },
  { key: "messages", title: "إدارة رسائل الولاء", hint: "الدخول لقسم رسائل الولاء وإرسال رسائل لعملاء المحفظة", icon: Megaphone },
  { key: "rewards", title: "إدارة المكافآت", hint: "تعديل عدد الأختام والمكافأة وموقع الفرع", icon: Gift },
];

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? "bg-[#3A2117]" : "bg-[#E4D6C6]"}`}>
      <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "right-1" : "right-6"}`} />
    </button>
  );
}

function PasswordInput({ value, onChange, placeholder, id }: { value: string; onChange: (value: string) => void; placeholder: string; id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={visible ? "text" : "password"} autoComplete="new-password" dir="ltr" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-[#E4D6C6] bg-white pe-3 ps-11 text-right text-sm text-[#311912] outline-none placeholder:text-[#A8968A] focus:border-[#B0894A]" />
      <button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#806A5E] hover:bg-[#F6EDE2]">
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

function AccessEditor({ access, setAccess, password, setPassword, hasLogin, idPrefix }: {
  access: Access; setAccess: (next: Access) => void; password: string; setPassword: (value: string) => void; hasLogin: boolean; idPrefix: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E8D9C8] bg-[#FFFBF6] px-3.5 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#B0894A]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#311912]">الدخول إلى لوحة تحكم العلامة</p>
            <p className="mt-0.5 text-xs leading-5 text-[#806A5E]">يدخل من صفحة تسجيل الدخول برقم جواله وكلمة مرور تحددها له</p>
          </div>
        </div>
        <Switch checked={access.canLogin} onChange={canLogin => setAccess({ ...access, canLogin })} label="الدخول إلى لوحة تحكم العلامة" />
      </div>
      {access.canLogin && <>
        <div className="px-1">
          <label htmlFor={`${idPrefix}-password`} className="mb-1.5 block text-xs font-semibold text-[#5B4336]">{hasLogin ? "كلمة مرور جديدة اتركها فارغة للإبقاء على الحالية" : "كلمة مرور الدخول"}</label>
          <PasswordInput id={`${idPrefix}-password`} value={password} onChange={setPassword} placeholder={hasLogin ? "بدون تغيير" : "8 أحرف أو أرقام على الأقل"} />
        </div>
        {permissionRows.map(({ key, title, hint, icon: Icon }) => (
          <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-[#EFE4D7] bg-white px-3.5 py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#806A5E]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#311912]">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#806A5E]">{hint}</p>
              </div>
            </div>
            <Switch checked={access[key]} onChange={value => setAccess({ ...access, [key]: value })} label={title} />
          </div>
        ))}
      </>}
    </div>
  );
}

function displayPhone(phone: string | null) {
  return phone ? phone.replace(/^\+966/, "0") : "بدون رقم جوال";
}

function MemberCard({ member, onNotice }: { member: BrandStaffMember; onNotice: (notice: Notice) => void }) {
  const router = useRouter();
  const initial: Access = { canLogin: member.canLogin, menu: member.menu, messages: member.messages, rewards: member.rewards };
  const [access, setAccess] = useState<Access>(initial);
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCashier = Boolean(member.cashierId);
  const needsPhone = isCashier && !member.accountId && !member.phone;
  const changed = JSON.stringify(access) !== JSON.stringify(initial) || password.length > 0;

  function save() {
    startTransition(async () => {
      const result = await saveBrandStaffAccessAction({ accountId: member.accountId, cashierId: member.accountId ? null : member.cashierId, phone: phone || undefined, ...access, password });
      onNotice({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) { setPassword(""); router.refresh(); }
    });
  }

  function remove() {
    if (!member.accountId) return;
    startTransition(async () => {
      const result = await removeBrandEmployeeAction(member.accountId as string);
      onNotice({ tone: result.ok ? "ok" : "error", text: result.message });
      setConfirmDelete(false);
      if (result.ok) router.refresh();
    });
  }

  return (
    <article className="rounded-2xl border border-[#E8D9C8] bg-white p-4 shadow-[0_10px_30px_rgba(58,33,23,0.05)]">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F6EDE2] text-[#3A2117]">
            {isCashier ? <ScanLine className="h-5 w-5" aria-hidden="true" /> : <UserRound className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold text-[#311912]">{member.name}</h3>
            <p className="mt-0.5 text-xs text-[#806A5E]" dir="ltr" style={{ textAlign: "right" }}>{displayPhone(member.phone)}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {isCashier && <span className="rounded-full bg-[#F6EDE2] px-2.5 py-1 text-[11px] font-semibold text-[#5B4336]">كاشير</span>}
          {member.cashierActive === false && <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">الكاشير موقوف</span>}
          {member.canLogin && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">يدخل للوحة التحكم</span>}
        </div>
      </header>
      {isCashier && <p className="mb-3 rounded-xl bg-[#FBF6EF] px-3 py-2 text-xs leading-5 text-[#6B5446]">صلاحيات الكاشير الحالية تبقى كما هي ويدخل لها من صفحة دخول الكاشير</p>}
      {needsPhone && access.canLogin && (
        <div className="mb-3">
          <label htmlFor={`${member.key}-phone`} className="mb-1.5 block text-xs font-semibold text-[#5B4336]">رقم جوال الكاشير للدخول</label>
          <input id={`${member.key}-phone`} inputMode="tel" dir="ltr" value={phone} onChange={event => setPhone(event.target.value)} placeholder="05XXXXXXXX"
            className="h-11 w-full rounded-xl border border-[#E4D6C6] bg-white px-3 text-right text-sm outline-none focus:border-[#B0894A]" />
        </div>
      )}
      <AccessEditor access={access} setAccess={setAccess} password={password} setPassword={setPassword} hasLogin={member.hasLogin} idPrefix={member.key} />
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={save} disabled={pending || !changed}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#3A2117] px-4 text-sm font-semibold text-white transition hover:bg-[#2A170F] disabled:opacity-40">
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}حفظ الصلاحيات
        </button>
        {!isCashier && member.accountId && (confirmDelete
          ? <span className="flex items-center gap-2 text-xs text-[#6B5446]">حذف الموظف وإلغاء دخوله؟
              <button type="button" onClick={remove} disabled={pending} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">تأكيد الحذف</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-[#E4D6C6] px-3 py-1.5 font-semibold text-[#5B4336]">تراجع</button>
            </span>
          : <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" />حذف
            </button>)}
      </footer>
    </article>
  );
}

function AddEmployee({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [access, setAccess] = useState<Access>({ canLogin: true, menu: false, messages: false, rewards: false });
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addBrandEmployeeAction({ name, phone, ...access, password });
      onNotice({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) {
        setName(""); setPhone(""); setPassword(""); setAccess({ canLogin: true, menu: false, messages: false, rewards: false });
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#E5B85C]/40 bg-gradient-to-b from-[#FFF8EC] to-white p-4 shadow-[0_14px_40px_rgba(58,33,23,0.07)]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3A2117] text-[#FFD77E]"><UserPlus className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h2 className="text-[15px] font-bold text-[#311912]">إضافة موظف</h2>
          <p className="text-xs text-[#806A5E]">موظف غير كاشير يدخل إلى الأقسام التي تحددها له</p>
        </div>
      </div>
      <fieldset disabled={pending} className="space-y-2.5">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor="new-staff-name" className="mb-1.5 block text-xs font-semibold text-[#5B4336]">اسم الموظف</label>
            <input id="new-staff-name" required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#E4D6C6] bg-white px-3 text-sm outline-none focus:border-[#B0894A]" />
          </div>
          <div>
            <label htmlFor="new-staff-phone" className="mb-1.5 block text-xs font-semibold text-[#5B4336]">رقم الجوال</label>
            <input id="new-staff-phone" required inputMode="tel" dir="ltr" value={phone} onChange={event => setPhone(event.target.value)} placeholder="05XXXXXXXX"
              className="h-11 w-full rounded-xl border border-[#E4D6C6] bg-white px-3 text-right text-sm outline-none focus:border-[#B0894A]" />
          </div>
        </div>
        <AccessEditor access={access} setAccess={setAccess} password={password} setPassword={setPassword} hasLogin={false} idPrefix="new-staff" />
        <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#3A2117] px-5 text-sm font-semibold text-white transition hover:bg-[#2A170F] disabled:opacity-50">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}إضافة الموظف
        </button>
      </fieldset>
    </form>
  );
}

export function StaffPermissionsPage({ brandName, initial }: { brandName: string; initial: { employees: BrandStaffMember[]; cashiers: BrandStaffMember[] } | null }) {
  const [notice, setNotice] = useState<Notice>(null);
  const data = initial;
  // Remount cards after a refresh so each one starts from the saved values
  const version = data ? JSON.stringify([...data.employees, ...data.cashiers].map(member => [member.key, member.canLogin, member.menu, member.messages, member.rewards, member.hasLogin])) : "";

  return (
    <div dir="rtl" className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <p className="text-xs font-semibold text-[#B0894A]">{brandName}</p>
        <h1 className="mt-1 text-2xl font-bold text-[#311912]">إدارة صلاحيات الموظفين</h1>
        <p className="mt-1.5 text-sm leading-6 text-[#6B5446]">حدد من يدخل إلى لوحة تحكم العلامة وما الأقسام المتاحة له</p>
      </header>
      {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{notice.text}</p>}
      {!data ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">تعذر تحميل الموظفين حدّث الصفحة</p> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="space-y-3" aria-labelledby="staff-employees-title">
            <AddEmployee onNotice={setNotice} />
            <h2 id="staff-employees-title" className="pt-1 text-sm font-bold text-[#5B4336]">الموظفون ({data.employees.length})</h2>
            {data.employees.length === 0 && <p className="rounded-xl border border-dashed border-[#E4D6C6] p-4 text-sm text-[#806A5E]">لم تضف موظفين بعد</p>}
            {data.employees.map(member => <MemberCard key={`${member.key}:${version}`} member={member} onNotice={setNotice} />)}
          </section>
          <section className="space-y-3" aria-labelledby="staff-cashiers-title">
            <h2 id="staff-cashiers-title" className="text-sm font-bold text-[#5B4336]">الكاشيرات من إدارة الكاشير ({data.cashiers.length})</h2>
            {data.cashiers.length === 0 && <p className="rounded-xl border border-dashed border-[#E4D6C6] p-4 text-sm text-[#806A5E]">لا يوجد كاشير مضاف</p>}
            {data.cashiers.map(member => <MemberCard key={`${member.key}:${version}`} member={member} onNotice={setNotice} />)}
          </section>
        </div>
      )}
    </div>
  );
}
