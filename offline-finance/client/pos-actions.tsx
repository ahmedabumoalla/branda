import React, { type ReactNode } from "react";
import { KeyRound } from "lucide-react";
import { FinancePosActions as OriginalActions } from "../../components/finance/finance-pos-actions";
import Link from "./navigation";
import styles from "../../components/finance/finance.module.css";
export function FinancePosActions({ children, details }: { children: ReactNode; details?: ReactNode }) {
  return <OriginalActions details={details}>{children}<Link href="/local/password" className={styles.secondary}><KeyRound size={16} aria-hidden="true" />تغيير كلمة المرور</Link></OriginalActions>;
}
