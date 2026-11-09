import { act, renderHook } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBrowserReady, useBrowserSearch, useMediaQuery } from "@/lib/browser-signals";
import { useSearchVisualPhase } from "@/components/search-visual-pipeline";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("browser state without effect-driven hydration updates", () => {
  it("hydrates server markup safely, then reads the browser URL", async () => {
    function Probe() {
      const ready = useBrowserReady();
      const search = useBrowserSearch();
      return <span>{ready ? search : "server"}</span>;
    }
    window.history.replaceState({}, "", "/?intent_role=Frontend");
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Probe />);
    expect(container.textContent).toBe("server");
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, <Probe />, { onRecoverableError }); });
    expect(container.textContent).toBe("?intent_role=Frontend");
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("updates search intent on back/forward navigation", () => {
    const { result } = renderHook(() => useBrowserSearch());
    act(() => {
      window.history.replaceState({}, "", "/?intent_role=QA");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current).toBe("?intent_role=QA");
  });

  it("responds to motion preference changes and removes its listener", () => {
    let matches = false;
    const target = new EventTarget();
    const addEventListener = vi.fn(target.addEventListener.bind(target));
    const removeEventListener = vi.fn(target.removeEventListener.bind(target));
    vi.stubGlobal("matchMedia", () => ({ get matches() { return matches; }, addEventListener, removeEventListener }));
    const { result, unmount } = renderHook(() => useMediaQuery("(prefers-reduced-motion: reduce)"));
    expect(result.current).toBe(false);
    act(() => { matches = true; target.dispatchEvent(new Event("change")); });
    expect(result.current).toBe(true);
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", addEventListener.mock.calls[0][1]);
  });

  it("restarts loading phases after a cancelled search and clears timers", () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ active }) => useSearchVisualPhase(active), { initialProps: { active: true } });
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current).toBe("prioritizing");
    rerender({ active: false });
    expect(result.current).toBe("idle");
    rerender({ active: true });
    expect(result.current).toBe("analyzing");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
