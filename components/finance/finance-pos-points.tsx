"use client";
import { useEffect, useState } from "react";
import { getPointsBalance } from "@/app/actions/erp-points";
import { pointsDiscount, pointsIssue, type PointsBalance } from "@/lib/erp/points";

const none: PointsBalance = { enabled: false, balance: 0 };

/** Loyalty points of the customer typed in the cashier. Inactive brands never call the server. */
export function usePosPoints(slug: string, phone: string | null, active: boolean, connected: boolean) {
  const [state, setState] = useState<{ phone: string; info: PointsBalance }>({ phone: "", info: none });
  const [points, setPoints] = useState(0);
  const target = active && connected && phone ? phone : "";
  useEffect(() => {
    if (!target) return;
    let alive = true;
    void getPointsBalance(slug, target).then(info => { if (alive) setState({ phone: target, info }); }).catch(() => { if (alive) setState({ phone: target, info: none }); });
    return () => { alive = false; };
  }, [slug, target]);
  // A balance fetched for another phone is never shown or spent
  const info = target && state.phone === target ? state.info : none;
  const spend = info.enabled ? points : 0;
  return {
    info, points: spend, setPoints, value: pointsDiscount(spend, info), loading: !!target && state.phone !== target,
    issue: (subtotal: number) => pointsIssue(spend, info, subtotal),
    reset: () => { setPoints(0); setState({ phone: "", info: none }); },
  };
}

export function FinancePosPoints({ points, disabled, subtotal, className }: { points: ReturnType<typeof usePosPoints>; disabled: boolean; subtotal: number; className?: string }) {
  const { info } = points;
  if (!info.enabled) return null;
  const issue = points.issue(subtotal);
  const usable = info.balance >= (info.minRedeemPoints ?? 1);
  return <div className={className} style={{ display: "grid", gap: 6, padding: "10px 12px", border: "1px solid currentColor", borderRadius: 12, opacity: disabled ? .7 : 1 }}>
    <strong style={{ fontSize: 13 }}>نقاط العميل {info.balance} نقطة بقيمة {(info.value ?? 0).toFixed(2)} ريال</strong>
    {usable ? <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
      <span title="عدد النقاط التي يدفع بها العميل جزءًا من هذه الفاتورة وتخصم قيمتها من الإجمالي">نقاط تستبدل في هذه الفاتورة ؟</span>
      <input type="number" inputMode="numeric" min="0" max={info.balance} step="1" value={points.points || ""} disabled={disabled} placeholder={`من ${info.minRedeemPoints} إلى ${info.balance}`}
        onChange={event => points.setPoints(Math.max(0, Math.floor(Number(event.target.value) || 0)))} />
    </label> : <span style={{ fontSize: 12 }}>الرصيد أقل من الحد الأدنى للاستبدال {info.minRedeemPoints} نقطة</span>}
    {points.points > 0 && !issue && <span style={{ fontSize: 12 }}>يخصم {points.value.toFixed(2)} ريال من الفاتورة مقابل {points.points} نقطة</span>}
    {issue && <span role="alert" style={{ fontSize: 12, color: "#a8323f" }}>{issue}</span>}
  </div>;
}
