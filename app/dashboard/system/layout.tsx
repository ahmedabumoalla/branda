import type {ReactNode} from 'react';
import {SystemAppearance} from '@/components/erp/settings/appearance';
import {BranchContextProvider} from '@/components/erp/branches/context';
import {getBranchContext} from '@/app/actions/erp-branches';

async function BranchContextBootstrap({pending,children}:{pending:ReturnType<typeof getBranchContext>;children:ReactNode}){
 const result=await pending;
 return <BranchContextProvider initialContext={result.ok?result.data:null} initialError={result.ok?'':result.message}>{children}</BranchContextProvider>;
}

export default function SystemLayout({children}:{children:ReactNode}){
 // Start with the appearance/page reads, sharing request-scoped authentication.
 const branchContext=getBranchContext();
 return <SystemAppearance><BranchContextBootstrap pending={branchContext}>{children}</BranchContextBootstrap></SystemAppearance>;
}
