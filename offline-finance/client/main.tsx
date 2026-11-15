import React, { Component, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronDown, KeyRound, LogOut, Monitor, UserRoundCog, LayoutDashboard } from "lucide-react";
import { FinanceWorkspace } from "../../components/finance/finance-workspace";
import { FinancePOS } from "../../components/finance/finance-pos";
import { financeMenuGroups, financeMenuHref, financeSectionAllowed } from "../../components/finance/finance-navigation";
import { canFinance } from "../../lib/finance/permissions";
import type { FinanceSnapshot } from "../../lib/finance/brand-finance";
import sidebar from "../../components/dashboard/finance-sidebar-menu.module.css";
import styles from "../../components/finance/finance.module.css";
import Link, { useLocation } from "./navigation";
import { localRequest, setCsrf } from "./api";
import { LocalUsers, LocalPassword } from "./users";
import { LocalProducts } from "./products";
import { BackupLink, LocalBackup } from "./backup";
import { LocalAuth, type LocalSession } from "./auth";
import "./shell.css";
const LOCAL_PRODUCTS_LABEL = "المنتجات والأسعار";
const LOCAL_OWNER_ONLY = "هذه الصفحة متاحة للمالك فقط";
class LocalBoundary extends Component<{ children: React.ReactNode }, { error: string }> {
 state = { error: "" }; static getDerivedStateFromError(error: Error) { return { error: error.message }; }
 render() { return this.state.error ? <div className="offline-error" role="alert"><h1>تعذر عرض الصفحة</h1><p>{this.state.error}</p><button onClick={() => location.reload()}>إعادة تحميل</button></div> : this.props.children; }
}
function Sidebar({ snapshot, logout }: { snapshot: FinanceSnapshot; logout: () => Promise<void> }) {
 const route = useLocation(), params = new URLSearchParams(location.search), [opened, setOpened] = useState(params.get("section") || "sales");
 const groups = financeMenuGroups.map(group => ({ ...group, entries: group.entries.filter(entry => financeSectionAllowed(entry.section, snapshot.role, snapshot.canManageCashiers)) })).filter(group => group.entries.length);
 return <aside className="offline-sidebar"><Link href="/dashboard/finance"><img src="/brand/barndaksa-logo-dark.png" alt="برندة" /></Link><p>{snapshot.cafe.name}</p><nav className={`${sidebar.root} ${sidebar.direct}`} aria-label="أقسام المالية"><Link className={sidebar.item} href="/dashboard/finance"><LayoutDashboard className={sidebar.icon} />نظرة مالية</Link>{canFinance(snapshot.role, "pos") && <Link className={sidebar.item} href="/dashboard/finance/pos"><Monitor className={sidebar.icon} />نقطة البيع</Link>}{groups.map(group => <div key={group.id}><button className={`${sidebar.groupTrigger} ${params.get("section") === group.id ? sidebar.active : ""}`} aria-expanded={opened === group.id} onClick={() => setOpened(opened === group.id ? "" : group.id)}><group.icon className={sidebar.icon} /><span className={sidebar.groupLabel}>{group.label}</span><ChevronDown className={sidebar.chevron} /></button><div className={sidebar.items} hidden={opened !== group.id}>{group.entries.map(entry => { const href = financeMenuHref(entry)!; return <Link key={entry.id} href={href} className={`${sidebar.item} ${route === href ? sidebar.active : ""}`} aria-current={route === href ? "page" : undefined}>{entry.label}</Link>; })}</div></div>)}{snapshot.role === "owner" && <Link className={sidebar.item} href="/local/products">{LOCAL_PRODUCTS_LABEL}</Link>}{snapshot.role === "owner" && <Link className={sidebar.item} href="/local/users"><UserRoundCog className={sidebar.icon} />إدارة المستخدمين والصلاحيات</Link>}<Link className={sidebar.item} href="/local/password"><KeyRound className={sidebar.icon} />تغيير كلمة المرور</Link>{snapshot.role === "owner" && <BackupLink />}</nav><footer><span>البيانات محفوظة على هذا الجهاز</span><button onClick={() => void logout()}><LogOut size={16} />خروج</button></footer></aside>;
}
function App() {
 const route = useLocation(), pathname = route.split("?")[0], refreshSequence = useRef(0), [sessionPath, setSessionPath] = useState(""), [session, setSession] = useState<LocalSession | null>(null), [error, setError] = useState("");
 async function refresh(): Promise<LocalSession> { const sequence = ++refreshSequence.current, requestedPath = location.pathname; const current = await localRequest("/api/session"); if (sequence !== refreshSequence.current) return current; setCsrf(current.csrf); setSession(current); setSessionPath(requestedPath); return current; }
 useEffect(() => { void refresh().catch(e => setError(e.message)); const listener = () => void refresh().catch(e => setError(e.message)); window.addEventListener("branda:session-refresh", listener); return () => window.removeEventListener("branda:session-refresh", listener); }, [pathname]);
 const logout = async () => { try { await localRequest("/api/logout", {}); window.dispatchEvent(new Event("branda:logout")); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "تعذر الخروج"); } };
 if (error) return <div className="offline-error"><p role="alert">{error}</p><button onClick={() => { setError(""); void refresh().catch(e => setError(e.message)); }}>إعادة المحاولة</button></div>;
 if (!session || sessionPath !== pathname) return <p className="offline-loading" role="status">جار فتح المالية المحلية</p>;
 if (!session.authenticated || !session.snapshot) return <LocalAuth session={session} refresh={refresh} />;
 const snapshot = session.snapshot, pos = route.split("?")[0].endsWith("/pos") || snapshot.role === "cashier" && !route.startsWith("/local/password"), users = route.startsWith("/local/users");
 if (pos) return <div className="offline-pos-root"><FinancePOS initialSnapshot={snapshot} slug={snapshot.cafe.slug} dashboardHref="/dashboard/finance" /></div>;
 return <div className="offline-shell"><Sidebar snapshot={snapshot} logout={logout} /><main className="offline-workspace"><LocalBoundary key={users ? "users" : route.startsWith("/local/password") ? "password" : "finance"}>{users ? snapshot.role === "owner" ? <LocalUsers /> : <p role="alert">هذه الصفحة متاحة للمالك فقط</p> : route.startsWith("/local/password") ? <LocalPassword /> : route.startsWith("/local/products") ? snapshot.role === "owner" ? <LocalProducts snapshot={snapshot} /> : <p role="alert">{LOCAL_OWNER_ONLY}</p> : route.startsWith("/local/backup") ? snapshot.role === "owner" ? <LocalBackup /> : <p role="alert">{LOCAL_OWNER_ONLY}</p> : <FinanceWorkspace initialSnapshot={snapshot} />}</LocalBoundary></main></div>;
}
createRoot(document.getElementById("app")!).render(<LocalBoundary><App /></LocalBoundary>);
