"use client";
import {useRouter} from '../navigation';
import {ScopedTreasury} from './treasury-workspace';
import {TreasuryApiProvider} from './treasury-api';
import type {BranchScope} from '@/lib/erp/branches';
import type {FinanceSnapshot} from '@/lib/finance/brand-finance';
export function ErpTreasury({snapshot,canApprove,scope}:{snapshot:FinanceSnapshot;canApprove:boolean;scope:BranchScope|null}){const router=useRouter();return <TreasuryApiProvider scope={scope}><ScopedTreasury snapshot={canApprove?snapshot:{...snapshot,role:'auditor'}} slug={snapshot.cafe.slug} onRefresh={()=>router.refresh()}/></TreasuryApiProvider>;}
