"use client";

import { useCallback, useSyncExternalStore } from "react";

const noSubscription = () => () => {};
const clientReady = () => true;
const serverNotReady = () => false;
const serverSearch = () => "";
const browserSearch = () => window.location.search;

function subscribeLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/** Keeps the server and hydration render identical before reading browser state. */
export function useBrowserReady() {
  return useSyncExternalStore(noSubscription, clientReady, serverNotReady);
}

export function useBrowserSearch() {
  return useSyncExternalStore(subscribeLocation, browserSearch, serverSearch);
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia?.(query);
    media?.addEventListener("change", onChange);
    return () => media?.removeEventListener("change", onChange);
  }, [query]);
  const snapshot = useCallback(() => Boolean(window.matchMedia?.(query)?.matches), [query]);
  return useSyncExternalStore(subscribe, snapshot, serverNotReady);
}
