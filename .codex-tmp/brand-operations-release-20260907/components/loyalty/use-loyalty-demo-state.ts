"use client";

import { useEffect, useState } from "react";
import { loyaltyDashboardDemoState } from "@/lib/loyalty/demo-data";
import type {
  LoyaltyCardTextElement,
  LoyaltyDashboardDemoState,
  LoyaltyTextElementId,
} from "@/lib/loyalty/types";

export const LOYALTY_CARD_DESIGN_STORAGE_KEY = "barndaksa-loyalty-card-design";
const LEGACY_STORAGE_KEY = "barndaksa-demo-loyalty-config";
const LOYALTY_STATE_EVENT = "barndaksa-demo-loyalty-state";
const OLD_DEFAULT_CARD_COLORS = {
  cardBackground: "#4A281D",
  cardForeground: "#FCF8F3",
  cardAccent: "#D9A33F",
};
const PREVIOUS_YELLOW_DEFAULT_LAYOUT = {
  pointsBadgeY: 66,
  qrY: 36,
  titleX: 6,
};

const FALLBACK_CARD_TEXT = {
  brandName: loyaltyDashboardDemoState.card.brandName,
  cardTitle: loyaltyDashboardDemoState.card.cardTitle,
  subtitle: loyaltyDashboardDemoState.card.subtitle,
  rewardTitle: loyaltyDashboardDemoState.card.rewardTitle,
  supportingText: loyaltyDashboardDemoState.card.supportingText,
  stampLabel: loyaltyDashboardDemoState.card.stampLabel,
  terms: loyaltyDashboardDemoState.card.terms,
};

const FALLBACK_POINTS_TEXT = {
  earningRule: loyaltyDashboardDemoState.points.earningRule,
  redemptionRule: loyaltyDashboardDemoState.points.redemptionRule,
  policyText: loyaltyDashboardDemoState.points.policyText,
};
const TEXT_ELEMENT_IDS = Object.keys(loyaltyDashboardDemoState.card.textElements) as LoyaltyTextElementId[];
const LEGACY_TEXT_FIELD_BY_ELEMENT: Partial<Record<LoyaltyTextElementId, keyof typeof FALLBACK_CARD_TEXT>> = {
  brand: "brandName",
  title: "cardTitle",
  subtitle: "subtitle",
  reward: "rewardTitle",
  helper: "supportingText",
};

function hasMojibake(value: string) {
  return /(?:\u0637[\u00b8\u00b7\u00a7\u00a8\u00b1\u00b9\u00ab\u00ac\u00b5\u00b3\u00a9\u00ae\u00af\u06be\u00a3\u00a5]|\u0638[\u2020\u2026\u201e\u02c6\u0679\u2030\u0192\u067e\u201a\u2021\u00b9])|\u00e2|\u0622/.test(value);
}

function cleanText<T extends string>(value: T, fallback: string): string {
  return hasMojibake(value) ? fallback : value;
}

function withTextElementDefaults(
  value: Partial<LoyaltyDashboardDemoState> | null,
  card: LoyaltyDashboardDemoState["card"],
) {
  const stored = (value?.card?.textElements ?? {}) as Partial<LoyaltyDashboardDemoState["card"]["textElements"]>;
  return TEXT_ELEMENT_IDS.reduce(
    (next, id) => {
      const fallback = loyaltyDashboardDemoState.card.textElements[id];
      const legacyField = LEGACY_TEXT_FIELD_BY_ELEMENT[id];
      const legacyText = legacyField ? String(card[legacyField] ?? fallback.text) : fallback.text;
      const item = {
        ...fallback,
        ...(stored[id] ?? {}),
      } as LoyaltyCardTextElement;

      next[id] = {
        ...item,
        id,
        text: cleanText(String(item.text ?? legacyText), legacyText),
        x: Number.isFinite(Number(item.x)) ? Number(item.x) : fallback.x,
        y: Number.isFinite(Number(item.y)) ? Number(item.y) : fallback.y,
        width: Number.isFinite(Number(item.width)) ? Number(item.width) : fallback.width,
        height: Number.isFinite(Number(item.height)) ? Number(item.height) : fallback.height,
        fontSize: Number.isFinite(Number(item.fontSize)) ? Number(item.fontSize) : fallback.fontSize,
        fontWeight: Number.isFinite(Number(item.fontWeight)) ? Number(item.fontWeight) : fallback.fontWeight,
        color: String(item.color || fallback.color),
        align: item.align === "left" || item.align === "center" || item.align === "right" ? item.align : fallback.align,
        enabled: item.enabled !== false,
      };
      return next;
    },
    {} as LoyaltyDashboardDemoState["card"]["textElements"],
  );
}

function withDefaults(value: Partial<LoyaltyDashboardDemoState> | null): LoyaltyDashboardDemoState {
  const state = {
    card: {
      ...loyaltyDashboardDemoState.card,
      ...(value?.card ?? {}),
    },
    points: {
      ...loyaltyDashboardDemoState.points,
      ...(value?.points ?? {}),
    },
  };

  const usesOldDefaultColors =
    state.card.cardBackground === OLD_DEFAULT_CARD_COLORS.cardBackground &&
    state.card.cardForeground === OLD_DEFAULT_CARD_COLORS.cardForeground &&
    state.card.cardAccent === OLD_DEFAULT_CARD_COLORS.cardAccent;
  const missingRequiredTextElements =
    !value?.card?.textElements ||
    TEXT_ELEMENT_IDS.some((id) => !value.card?.textElements?.[id]);
  const usesPreviousYellowDefaultLayout =
    state.card.cardBackground === loyaltyDashboardDemoState.card.cardBackground &&
    Number(state.card.pointsBadgeY) === PREVIOUS_YELLOW_DEFAULT_LAYOUT.pointsBadgeY &&
    Number(state.card.qrY) === PREVIOUS_YELLOW_DEFAULT_LAYOUT.qrY &&
    Number(value?.card?.textElements?.title?.x) === PREVIOUS_YELLOW_DEFAULT_LAYOUT.titleX;

  const shouldResetSavedCard = usesOldDefaultColors || missingRequiredTextElements || usesPreviousYellowDefaultLayout;

  if (shouldResetSavedCard) {
    state.card = {
      ...loyaltyDashboardDemoState.card,
      enabled: state.card.enabled,
    };
  }

  state.card.brandName = cleanText(state.card.brandName, FALLBACK_CARD_TEXT.brandName);
  state.card.cardTitle = cleanText(state.card.cardTitle, FALLBACK_CARD_TEXT.cardTitle);
  state.card.subtitle = cleanText(state.card.subtitle, FALLBACK_CARD_TEXT.subtitle);
  state.card.rewardTitle = cleanText(state.card.rewardTitle, FALLBACK_CARD_TEXT.rewardTitle);
  state.card.supportingText = cleanText(state.card.supportingText, FALLBACK_CARD_TEXT.supportingText);
  state.card.stampLabel = cleanText(state.card.stampLabel, FALLBACK_CARD_TEXT.stampLabel);
  state.card.terms = cleanText(state.card.terms, FALLBACK_CARD_TEXT.terms);
  state.card.textElements = withTextElementDefaults(shouldResetSavedCard ? null : value, state.card);
  state.card.brandName = state.card.textElements.brand.text;
  state.card.cardTitle = state.card.textElements.title.text;
  state.card.subtitle = state.card.textElements.subtitle.text;
  state.card.rewardTitle = state.card.textElements.reward.text;
  state.card.supportingText = state.card.textElements.helper.text;
  state.points.earningRule = cleanText(state.points.earningRule, FALLBACK_POINTS_TEXT.earningRule);
  state.points.redemptionRule = cleanText(state.points.redemptionRule, FALLBACK_POINTS_TEXT.redemptionRule);
  state.points.policyText = cleanText(state.points.policyText, FALLBACK_POINTS_TEXT.policyText);

  return state;
}

function readStoredState() {
  if (typeof window === "undefined") return loyaltyDashboardDemoState;
  try {
    const stableRaw = window.localStorage.getItem(LOYALTY_CARD_DESIGN_STORAGE_KEY);
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const raw = stableRaw ?? legacyRaw;
    if (!raw) return loyaltyDashboardDemoState;
    const state = withDefaults(JSON.parse(raw) as Partial<LoyaltyDashboardDemoState>);
    if (!stableRaw && legacyRaw) {
      window.localStorage.setItem(LOYALTY_CARD_DESIGN_STORAGE_KEY, JSON.stringify(state));
    }
    return state;
  } catch {
    return loyaltyDashboardDemoState;
  }
}

export function saveLoyaltyDemoState(next: LoyaltyDashboardDemoState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOYALTY_CARD_DESIGN_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(LOYALTY_STATE_EVENT, { detail: next }));
}

export function useLoyaltyDemoState() {
  const [state, setState] = useState<LoyaltyDashboardDemoState>(loyaltyDashboardDemoState);

  useEffect(() => {
    setState(readStoredState());

    function handleStorage(event: StorageEvent) {
      if (event.key === LOYALTY_CARD_DESIGN_STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) {
        setState(readStoredState());
      }
    }

    function handleLocal(event: Event) {
      const detail = (event as CustomEvent<LoyaltyDashboardDemoState>).detail;
      setState(withDefaults(detail));
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(LOYALTY_STATE_EVENT, handleLocal);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LOYALTY_STATE_EVENT, handleLocal);
    };
  }, []);

  function updateState(next: LoyaltyDashboardDemoState) {
    setState(next);
    saveLoyaltyDemoState(next);
  }

  return [state, updateState] as const;
}
