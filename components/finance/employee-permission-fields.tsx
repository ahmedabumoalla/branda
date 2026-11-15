"use client";

import { useId, useState } from "react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { defaultCashierPermissions, type CashierPermissions } from "@/lib/finance/cashier-permissions";
import type { FinanceRole } from "@/lib/finance/permissions";
import { employeePermissionCatalog, employeePermissionDescriptions, employeePermissionsSchema, legacyEmployeePermissions, type EmployeePermissionKey, type EmployeePermissionRule, type EmployeePermissions } from "@/lib/finance/employee-permissions";
import styles from "./employee-permission-fields.module.css";

const actionLabels = { read: "الاطلاع", create: "الإضافة", update: "التعديل", delete: "الحذف", pay: "السداد", return: "الإرجاع", approve: "الاعتماد", credit: "الشراء الآجل", settings: "الإعدادات", stamp: "إضافة الأختام", redeem: "استبدال المكافآت", issue: "إصدار البطاقات" };

export function EmployeePermissionFields({ snapshot, value, role, employeeId, posPermissions }: {
  snapshot: FinanceSnapshot; value?: EmployeePermissions; role: FinanceRole; employeeId?: string; posPermissions?: Partial<CashierPermissions>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<EmployeePermissions | null>(null);
  const [query, setQuery] = useState("");
  const policy = draft ?? value ?? legacyEmployeePermissions(role, posPermissions ?? (employeeId ? undefined : defaultCashierPermissions));
  const customized = !!(draft || value || !employeeId);
  const candidates = snapshot.employeePermissionApprovers ?? [
    ...(snapshot.ownerUserId ? [{ userId: snapshot.ownerUserId, name: snapshot.ownerName || "مالك العلامة" }] : []),
    ...snapshot.staff.filter(staff => staff.active).map(staff => ({ userId: staff.user_id, name: staff.name })),
  ];
  const approvers = candidates.filter((person, index) => person.userId !== employeeId && candidates.findIndex(candidate => candidate.userId === person.userId) === index);
  const enabled = Object.values(policy).filter(rule => rule.enabled).length;
  function update(key: EmployeePermissionKey, rule: EmployeePermissionRule) { setDraft({ ...policy, [key]: rule }); }
  const groups = employeePermissionCatalog.filter(group => !query.trim() || `${group.label} ${group.actions.map(action => actionLabels[action]).join(" ")}`.includes(query.trim()));
  return <section className={styles.root} aria-labelledby={`${id}-title`}>
    <input type="hidden" name="employeePermissions" value={customized ? JSON.stringify(policy) : ""} />
    <header className={styles.header}><div><h3 id={`${id}-title`}>صلاحيات الموظف</h3><p>حدد ما يمكن للموظف تنفيذه واختر مسؤول الموافقة عند الحاجة</p></div><span className={styles.count}>{enabled} مفعلة</span></header>
    <label className={styles.search}><span>البحث في الصلاحيات</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم القسم أو الإجراء" /></label>
    {!customized && <p className={styles.hint}>تظهر الصلاحيات الموروثة من الدور الحالي ويبدأ تخصيصها عند تعديل أي إجراء</p>}
    <div className={styles.groups}>{groups.map(group => <details className={styles.group} key={group.domain} open={query.trim() ? true : undefined}>
      <summary><strong>{group.label}</strong><span>{group.actions.filter(action => policy[`${group.domain}.${action}` as EmployeePermissionKey].enabled).length} / {group.actions.length}</span></summary>
      <div className={styles.actions}>{group.actions.map(action => {
        const key = `${group.domain}.${action}` as EmployeePermissionKey;
        const rule = policy[key];
        const missingApprover = !!rule.approverId && !approvers.some(person => person.userId === rule.approverId);
        return <div className={styles.action} key={key} data-enabled={rule.enabled}>
          <label className={styles.check}><input type="checkbox" checked={rule.enabled} aria-describedby={`${id}-${key}-description`} onChange={event => update(key, { enabled: event.target.checked, approverId: event.target.checked ? rule.approverId : null })} /><span>{actionLabels[action]}</span></label>
          <p className={styles.description} id={`${id}-${key}-description`}>{employeePermissionDescriptions[key]}</p>
          {rule.enabled && action !== "read" && <label className={styles.approver}><span>مسؤول الموافقة <small>اختياري</small></span><select value={rule.approverId ?? ""} onChange={event => update(key, { ...rule, approverId: event.target.value || null })} aria-label={`مسؤول الموافقة على ${actionLabels[action]} في ${group.label}`}>
            <option value="">دون موافقة مسبقة</option>
            {missingApprover && <option value={rule.approverId!} disabled>المسؤول السابق غير متاح</option>}
            {approvers.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}
          </select><small>عند اختيار مسؤول ينتظر الإجراء موافقته قبل التنفيذ</small>{missingApprover && <small className={styles.warning}>اختر مسؤولًا نشطًا أو أزل شرط الموافقة</small>}</label>}
        </div>;
      })}</div>
    </details>)}</div>
    {!groups.length && <p className={styles.hint}>لا توجد صلاحيات تطابق البحث</p>}
  </section>;
}

export function readEmployeePermissions(data: FormData): EmployeePermissions | undefined {
  const raw = data.get("employeePermissions");
  return typeof raw === "string" && raw ? employeePermissionsSchema.parse(JSON.parse(raw)) : undefined;
}
