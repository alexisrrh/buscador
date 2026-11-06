import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeroGlobeStage } from "@/components/hero-globe-stage";

describe("shared earth globe stage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps a same-slot visual fallback when WebGL is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    render(<HeroGlobeStage state="SEARCHING" />);

    await waitFor(() => expect(screen.getByRole("img", { name: "Tierra holográfica disponible sin WebGL" })).toBeInTheDocument());
    expect(document.querySelector(".hero-globe-stage--fallback")).toBeInTheDocument();
    expect(document.querySelector(".hero-globe-stage canvas")).toBeNull();
  });

  it("keeps the earth slot free of duplicated location labels", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { rerender } = render(<HeroGlobeStage state="IDLE" />);
    await waitFor(() => expect(document.querySelector(".hero-globe-stage")).toBeInTheDocument());
    expect(screen.queryByText("DESTINO")).toBeNull();

    rerender(<HeroGlobeStage state="IDLE" intent={{ role: "Full Stack", location: "A Coruña", workMode: "REMOTE" }} />);
    expect(document.querySelector(".hero-globe-stage")).toBeInTheDocument();
    expect(screen.queryByText("DESTINO")).toBeNull();
    expect(screen.queryByText("A Coruña")).toBeNull();
  });
});
