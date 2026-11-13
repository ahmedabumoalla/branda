"use client";
import Link from "@/components/erp/navigation";
import {attendanceLabels,attendanceModules,type AttendanceSnapshot} from "@/lib/erp/attendance";
import {ShiftEditor} from "./shift-editor";
import {CatalogEditor} from "./catalog-editor";
import {TransactionEditor} from "./transaction-editor";
import {AttendanceList,AttendanceSchedule,type AttendanceListQuery} from "./list";
import {AttendanceDetail} from "./detail";
import {AttendanceImport} from "./import";
import {AttendanceSessionPanel} from "./session-panel";
import {attendanceBase} from "./ui";
import s from "./attendance.module.css";
const catalogs=["policies","leave-types","flags","restrictions","approvals","devices"];
export function AttendanceWorkspace({snapshot,mode,query}:{snapshot:AttendanceSnapshot;mode:string;query:AttendanceListQuery}){
 const kind=snapshot.module,record=["detail","edit"].includes(mode)?snapshot.records[0]:undefined;
 const self=snapshot.role==="self",ownLeave=kind==="leaves"&&(!record||record.employee_id===snapshot.ownEmployeeId&&record.status==="draft");
 const editable=(record?snapshot.canUpdate!==false:snapshot.canCreate!==false)&&(snapshot.canWrite||Boolean(ownLeave&&snapshot.ownEmployeeId))&&(!record||!(["leaves","permissions","settlements"].includes(kind)&&record.status!=="draft"));
 const create=editable&&!["schedule","sessions","settings"].includes(kind),form=["create","edit","calculate","import"].includes(mode);
 const modules=self?attendanceModules.filter(x=>["logs","days","leaves","sessions","balances","schedule","assignments"].includes(x)):attendanceModules;
 const canEditRecord=editable&&!["logs","sheets","sessions","balances"].includes(kind);
 return <main className={s.root} dir="rtl"><div className={s.bar}><div><p className={s.muted}>{snapshot.cafeName} / الحضور</p><h1>{attendanceLabels[kind]}</h1></div><div className={s.group}>{mode==="list"&&create&&<Link className={`${s.button} ${s.primary}`} href={`${attendanceBase}/${kind}/new`}>{kind==="balances"?"تعديل رصيد":"إضافة"}</Link>}{mode==="list"&&kind==="days"&&snapshot.canWrite&&<Link className={s.button} href={`${attendanceBase}/days/calculate`}>حساب الحضور</Link>}{mode==="list"&&["logs","days","allocations"].includes(kind)&&snapshot.canWrite&&<Link className={s.button} href={`${attendanceBase}/${kind}/import`}>استيراد</Link>}{mode==="detail"&&record&&canEditRecord&&<Link className={s.button} href={`${attendanceBase}/${kind}/${record.id}/edit`}>تعديل</Link>}{mode!=="list"&&mode!=="settings"&&<Link className={s.button} href={`${attendanceBase}/${kind}`}>العودة للقائمة</Link>}</div></div><nav className={s.nav} aria-label="أقسام الحضور">{modules.map(x=><Link key={x} aria-current={kind===x?"page":undefined} href={`${attendanceBase}/${x}`}>{attendanceLabels[x]}</Link>)}</nav>
 {form&&!editable?<p className={s.error}>لا تملك صلاحية تعديل هذا السجل</p>:mode==="import"?<AttendanceImport snapshot={snapshot}/>:form?kind==="shifts"?<ShiftEditor snapshot={snapshot} record={record}/>:catalogs.includes(kind)?<CatalogEditor snapshot={snapshot} record={record}/>:<TransactionEditor snapshot={snapshot} record={record} mode={mode} defaults={query}/>:mode==="settings"?<CatalogEditor snapshot={snapshot} readOnly={!snapshot.isOwner||snapshot.canSettings===false}/>:mode==="detail"?record?<AttendanceDetail snapshot={snapshot}/>:<p className={s.empty}>السجل غير موجود أو غير متاح</p>:kind==="schedule"?<AttendanceSchedule snapshot={snapshot} query={query}/>:<>{kind==="sessions"&&<div className={s.bar}><AttendanceSessionPanel snapshot={snapshot}/></div>}<AttendanceList snapshot={snapshot} query={query}/></>}
 </main>;
}
