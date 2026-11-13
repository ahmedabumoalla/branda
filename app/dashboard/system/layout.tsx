import type {ReactNode} from 'react';
import {SystemAppearance} from '@/components/erp/settings/appearance';
import {BranchContextProvider} from '@/components/erp/branches/context';
export default function SystemLayout({children}:{children:ReactNode}){return <SystemAppearance><BranchContextProvider>{children}</BranchContextProvider></SystemAppearance>;}
