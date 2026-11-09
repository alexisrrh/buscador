"use client";

const INTERACTION_QA_KEY = "BV01_INTERACTION_QA_LAST";
const INTERACTION_DEBUG_KEY = "BV01_INTERACTION_DEBUG_LAST";
const SEARCH_TIMING_KEY = "SEARCH_TIMING_QA_LAST";

type QaMetadata = { interactionClip?: string; interactionFinished?: boolean; navigationReason?: string };
type DevQaWindow = Window & {
  __BV01_INTERACTION_QA__?: Record<string, unknown>;
  __BV01_INTERACTION_DEBUG__?: Record<string, unknown>;
  __SEARCH_TIMING_QA__?: Record<string, unknown>;
  __LAST_SEARCH_QA__?: Readonly<Record<string, unknown>>;
};

function enabled() {
  return process.env.NODE_ENV === "development" && typeof window !== "undefined";
}

function snapshot(payload: Record<string, unknown>, metadata: QaMetadata = {}) {
  return {
    ...payload,
    capturedAt: new Date().toISOString(),
    sourceRoute: window.location.pathname,
    interactionClip: metadata.interactionClip ?? "BV01_PANEL_INTERACT",
    interactionFinished: metadata.interactionFinished ?? Boolean(payload.interactionFinished),
    ...(metadata.navigationReason ? { navigationReason: metadata.navigationReason } : {}),
  };
}

export function persistDevSearchQa(key: typeof INTERACTION_QA_KEY | typeof INTERACTION_DEBUG_KEY | typeof SEARCH_TIMING_KEY, payload: Record<string, unknown> | undefined, metadata?: QaMetadata) {
  if (!enabled() || !payload) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(snapshot(payload, metadata)));
  } catch {
    // Diagnostics must never affect the search flow when storage is unavailable.
  }
}

function read(key: string) {
  if (!enabled()) return undefined;
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

export function exposeLastSearchQa() {
  if (!enabled()) return;
  const timingWindow = window as DevQaWindow;
  timingWindow.__LAST_SEARCH_QA__ = deepFreeze({
    interaction: read(INTERACTION_QA_KEY),
    debug: read(INTERACTION_DEBUG_KEY),
    timing: read(SEARCH_TIMING_KEY),
  });
}

export function persistCurrentDevSearchQa(metadata?: QaMetadata) {
  if (!enabled()) return;
  const timingWindow = window as DevQaWindow;
  persistDevSearchQa(INTERACTION_QA_KEY, timingWindow.__BV01_INTERACTION_QA__, metadata);
  persistDevSearchQa(INTERACTION_DEBUG_KEY, timingWindow.__BV01_INTERACTION_DEBUG__, metadata);
  persistDevSearchQa(SEARCH_TIMING_KEY, timingWindow.__SEARCH_TIMING_QA__, metadata);
  exposeLastSearchQa();
}

export const DEV_SEARCH_QA_STORAGE_KEYS = { INTERACTION_QA_KEY, INTERACTION_DEBUG_KEY, SEARCH_TIMING_KEY } as const;
