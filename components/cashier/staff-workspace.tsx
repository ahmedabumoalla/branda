"use client";

import { Activity, useCallback, useEffect, useRef, useState } from "react";
import { loadStaffScreenAction } from "@/app/actions/staff-workspace";
import { staffScreenFromPath, staffScreenPath, type StaffScreen, type StaffScreenData } from "@/lib/cashier/workspace-types";
import { watchCashierSession } from "@/lib/cashier/watch-session";
import { PagerConsole } from "@/components/pager/pager-console";
import { RastCashier } from "@/components/rast-loyalty/rast-cashier";
import { StaffScreenNavigation } from "./staff-screen-link";
import { useCashierLanguage } from "./cashier-language";

/** Two views retained only in this authenticated tab, never in persistent/shared storage. */
export function StaffWorkspace({ initial, sessionKey }: { initial: StaffScreenData; sessionKey: string }) {
  const { t, dir } = useCashierLanguage();
  const [active, setActive] = useState<StaffScreen>(initial.screen);
  const [screens, setScreens] = useState<Partial<Record<StaffScreen, StaffScreenData>>>({ [initial.screen]: initial });
  const cache = useRef(screens);
  const pending = useRef<Partial<Record<StaffScreen, Promise<boolean>>>>({});
  const sequence = useRef(0);
  const alive = useRef(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const allowed = useCallback((screen: StaffScreen) => screen === initial.screen || (initial.screen === "loyalty" ? Boolean(initial.data.cashier.canUsePager) : Boolean(initial.context.canUseLoyalty)), [initial]);

  const ensureScreen = useCallback((screen: StaffScreen): Promise<boolean> => {
    if (!allowed(screen)) return Promise.resolve(false);
    if (cache.current[screen]) return Promise.resolve(true);
    const existing = pending.current[screen];
    if (existing) return existing;
    const request = loadStaffScreenAction(screen, sessionKey).then(result => {
      if (!alive.current) return false;
      if (!result.ok) {
        if (result.reset) window.location.reload();
        return false;
      }
      if (result.value.screen !== screen) return false;
      cache.current = { ...cache.current, [screen]: result.value };
      setScreens(cache.current);
      return true;
    }).catch(() => false).finally(() => { delete pending.current[screen]; });
    pending.current[screen] = request;
    return request;
  }, [allowed, sessionKey]);

  const navigate = useCallback(async (screen: StaffScreen, history = true) => {
    const attempt = ++sequence.current;
    setFailed(false);
    if (!cache.current[screen]) setLoading(true);
    const ready = await ensureScreen(screen);
    if (!alive.current || attempt !== sequence.current) return;
    setLoading(false);
    if (!ready) { setFailed(true); return; }
    if (history && window.location.pathname !== staffScreenPath(screen)) window.history.pushState(null, "", staffScreenPath(screen));
    setActive(screen);
  }, [ensureScreen]);

  useEffect(() => {
    alive.current = true;
    const stop = watchCashierSession(window, document, sessionKey);
    const prefetch = window.setTimeout(() => { void ensureScreen(initial.screen === "loyalty" ? "pager" : "loyalty"); }, 250);
    const pop = () => { const screen = staffScreenFromPath(window.location.pathname); if (screen) void navigate(screen, false); };
    window.addEventListener("popstate", pop);
    return () => { alive.current = false; stop(); window.clearTimeout(prefetch); window.removeEventListener("popstate", pop); };
  }, [ensureScreen, initial.screen, navigate, sessionKey]);

  return <StaffScreenNavigation.Provider value={screen => { void navigate(screen); }}>
    {(loading || failed) && <p dir={dir} role={failed ? "alert" : "status"} className="px-4 py-2 text-center text-sm">{t(failed ? "تعذر فتح الشاشة تحقق من الاتصال ثم اضغط الزر مرة أخرى" : "جار تجهيز الشاشة للمرة الأولى")}</p>}
    <Activity mode={active === "loyalty" ? "visible" : "hidden"}>
      {screens.loyalty?.screen === "loyalty" && <RastCashier initialData={screens.loyalty.data} identity={screens.loyalty.identity} />}
    </Activity>
    <Activity mode={active === "pager" ? "visible" : "hidden"}>
      {screens.pager?.screen === "pager" && <PagerConsole context={screens.pager.context} initialPage={screens.pager.page} />}
    </Activity>
  </StaffScreenNavigation.Provider>;
}
