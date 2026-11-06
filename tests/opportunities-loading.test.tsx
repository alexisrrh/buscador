import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OpportunitiesLoading from "@/app/oportunidades/loading";

describe("real opportunity search loading boundary", () => {
  it("uses SEARCHING with one primary status and no fabricated progress", () => {
    const { container } = render(<OpportunitiesLoading />);
    expect(container.querySelector(".opportunities-search")).toHaveAttribute("data-agent-state", "searching");
    expect(screen.getByRole("status")).toHaveTextContent(/Buscando\s*oportunidades/);
    expect(screen.queryByLabelText(/Estado de BV-01/)).toBeNull();
    expect(screen.queryByLabelText(/Actividad de la sesi/)).toBeNull();
    expect(screen.getByTestId("bv-01-static-hero")).toHaveAttribute("data-state", "searching");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it("uses the static poster and does not render the BV-01 WebGL fallback", () => {
    const { container } = render(<OpportunitiesLoading />);
    expect(screen.getByTestId("bv-01-static-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("bv-01-fallback")).toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("keeps the submitted data only in the top profile cards", async () => {
    window.history.replaceState({}, "", "/oportunidades?intent_role=Frontend+Developer&intent_location=A+Coru%C3%B1a&intent_mode=REMOTE");
    render(<OpportunitiesLoading />);
    await waitFor(() => expect(screen.getAllByText("Frontend Developer")).toHaveLength(1));
    expect(screen.getAllByText("A Coruña")).toHaveLength(1);
    expect(screen.getAllByText("Remoto")).toHaveLength(1);
    window.history.replaceState({}, "", "/");
  });

});
