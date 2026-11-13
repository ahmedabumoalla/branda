import {readBranches} from '@/lib/data/erp-branches';
import {BranchWorkspace} from '@/components/erp/branches/workspace';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function BranchesPage({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;if(path.length>2||path[1]&&path[1]!=='edit')notFound();const initial=await readBranches();if(path[0]&&!['new','settings'].includes(path[0])&&!initial.branches.some(b=>b.id===path[0]))notFound();if(['new','settings'].includes(path[0])&&path.length>1)notFound();return <BranchWorkspace key={path.join('/')} initial={initial} path={path}/>;}
