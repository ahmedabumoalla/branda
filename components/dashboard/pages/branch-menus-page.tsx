import Link from "next/link";
import { ArrowUpLeft, CarFront, Store, Pencil } from "lucide-react";
import type { MenuBranch } from "@/lib/data/menu-branches";
import { DashboardPageShell } from "@/components/ui/design-system";

export function BranchMenusPage({ branches, slug }: { branches: MenuBranch[]; slug: string }) {
  return <DashboardPageShell title="الفروع" subtitle="لكل فرع منيو مستقل بصوره وأصنافه وأسعاره"><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{branches.map(branch => {
    const Icon = /drive|درايف/i.test(`${branch.slug} ${branch.name}`) ? CarFront : Store;
    const panelClass = "flex min-h-48 flex-col items-center justify-center gap-5 rounded-2xl bg-[#fcf8f3] p-6 text-center";
    const content = <><span className="rounded-2xl bg-[#6d3b25] p-5 text-white"><Icon className="h-9 w-9" aria-hidden="true" /></span><h2 className="text-xl font-bold">{branch.name}</h2><span className="flex items-center gap-2 text-sm">{branch.active ? "افتح منيو الفرع" : "الفرع غير منشور"}{branch.active && <ArrowUpLeft className="h-4 w-4" aria-hidden="true" />}</span></>;
    return <article key={branch.id} className="rounded-3xl border border-[#b99b773d] bg-white p-6 shadow-sm">
      {branch.active ? <Link href={`/menu/${encodeURIComponent(slug)}?branch=${encodeURIComponent(branch.slug)}`} target="_blank" rel="noopener noreferrer" className={panelClass}>{content}</Link> : <div className={panelClass}>{content}</div>}
      <Link href={`/dashboard/menu?branch=${branch.id}`} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#b99b7755] text-sm font-bold"><Pencil className="h-4 w-4" aria-hidden="true" />إدارة أصناف وأسعار الفرع</Link>
    </article>;
  })}</div>{!branches.length && <div className="rounded-2xl border border-[#b99b7740] bg-white p-8 text-center"><Store className="mx-auto mb-4 h-9 w-9" aria-hidden="true" /><p>لم تتم إضافة منيوهات فروع بعد</p><Link href="/dashboard/menu" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#6d3b25] px-6 text-white">إدارة المنيو</Link></div>}</DashboardPageShell>;
}
