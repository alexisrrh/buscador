const prefix = "bv01:";

/**
 * Leaves marks in the browser Performance timeline without emitting console
 * output. They are intentionally useful in local production DevTools.
 */
export function markBV01Load(name: string) {
  if (typeof performance !== "undefined") performance.mark(`${prefix}${name}`);
}

export function measureBV01Load(name: string, start: string, end: string) {
  if (typeof performance !== "undefined") {
    performance.measure(`${prefix}${name}`, `${prefix}${start}`, `${prefix}${end}`);
  }
}

export function markBV01LoadAt(name: string, startTime: number) {
  if (typeof performance !== "undefined") performance.mark(`${prefix}${name}`, { startTime });
}
