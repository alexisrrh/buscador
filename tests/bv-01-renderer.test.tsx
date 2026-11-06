import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BV01Renderer } from "@/components/bv-01-renderer";

describe("BV-01 renderer loading and fallback contract", () => {
  it("renders the approved BV-01 poster during initial capability detection without rendering the legacy SVG", () => {
    const webgl = Object.getOwnPropertyDescriptor(window, "WebGLRenderingContext");
    Object.defineProperty(window, "WebGLRenderingContext", { configurable: true, value: class WebGLRenderingContext {} });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as WebGLRenderingContext);
    vi.useFakeTimers();
    const { container } = render(<BV01Renderer state="LISTENING" />);
    expect(screen.getByTestId("bv-01-poster")).toHaveAttribute("data-state", "listening");
    expect(screen.getByTestId("bv-01-poster").querySelector("img")).toHaveAttribute("src", "/models/bv-01/BV01_runtime_poster_lit.webp?v=20260916-static-lit-v2");
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByTestId("bv-01-svg-fallback")).not.toBeInTheDocument();
    getContext.mockRestore();
    if (webgl) Object.defineProperty(window, "WebGLRenderingContext", webgl);
    else delete (window as Window & { WebGLRenderingContext?: typeof WebGLRenderingContext }).WebGLRenderingContext;
    vi.useRealTimers();
  });

  it("uses only the static WebP branch when requested, without WebGL or a canvas", () => {
    const { container } = render(<BV01Renderer state="IDLE" staticOnly />);
    expect(screen.getByTestId("bv-01-static-hero")).toHaveAttribute("data-state", "idle");
    expect(screen.getByTestId("bv-01-poster").querySelector("img")).toHaveAttribute("src", "/models/bv-01/BV01_runtime_poster_lit.webp?v=20260916-static-lit-v2");
    expect(container.querySelector("canvas, .bv-01-three, .bv-01-neutral")).toBeNull();
  });

  it("keeps a neutral brand fallback for a confirmed no-WebGL condition", () => {
    const { container } = render(<BV01Renderer state="SAVING" forceFallback />);
    expect(screen.getByTestId("bv-01-fallback")).toHaveAttribute("data-state", "saving");
    expect(screen.getByRole("img", { name: "BV-01 disponible sin renderizado 3D: GUARDANDO" })).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("uses the same non-legacy fallback on a low-capability device", async () => {
    const deviceMemory = Object.getOwnPropertyDescriptor(navigator, "deviceMemory");
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 1 });

    const { container } = render(<BV01Renderer state="SEARCHING" />);

    await waitFor(() => expect(screen.getByTestId("bv-01-fallback")).toHaveTextContent("BUSCANDO"));
    expect(container.querySelector("svg")).toBeNull();

    if (deviceMemory) Object.defineProperty(navigator, "deviceMemory", deviceMemory);
    else delete (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  });

  it.each([
    ["IDLE", "EN ESPERA"],
    ["LISTENING", "ESCUCHANDO"],
    ["SAVING", "GUARDANDO"],
    ["SEARCHING", "BUSCANDO"],
    ["SEARCH_READY", "LISTO"],
    ["SEARCH_RESULTS", "RESULTADOS LISTOS"],
    ["ERROR", "ERROR"],
  ] as const)("uses the real %s status in the neutral fallback without mounting the legacy character", (state, status) => {
    const { container } = render(<BV01Renderer state={state} forceFallback />);

    expect(screen.getByTestId("bv-01-fallback")).toHaveTextContent(status);
    expect(container.querySelector("svg")).toBeNull();
  });
});
