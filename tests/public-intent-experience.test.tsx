import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { PublicIntentExperience } from "@/components/public-intent-experience";

describe("public BV-01 entry", () => {
  it("uses one BV-01 scene and no duplicate process status", () => {
    const { container } = render(<PublicIntentExperience intent={null} />);
    expect(screen.getByRole("heading", { name: /trabajo quieres conseguir/i })).toBeInTheDocument();
    expect(screen.getByTestId("bv-01-static-hero")).toHaveAttribute("data-state", "idle");
    expect(screen.getByLabelText(/trabajo buscas/i)).toBeRequired();
    expect(screen.queryByLabelText(/Estado de BV-01/)).toBeNull();
    expect(screen.queryByLabelText(/Actividad de la sesi/)).toBeNull();
    expect(screen.getByText("No indicada")).toBeInTheDocument();
    expect(screen.getAllByText("Sin preferencia")).toHaveLength(2);
    expect(container.querySelector(".hero-globe-stage")).toBeInTheDocument();
    expect(container.querySelector(".intent-aside, .intent-orb, .intent-grid")).toBeNull();
  });

  it("keeps the live profile cards synchronized with the real form fields", () => {
    render(<PublicIntentExperience intent={null} />);
    fireEvent.change(screen.getByLabelText(/trabajo buscas/i), { target: { value: "Desarrollador Full Stack Junior" } });
    fireEvent.change(screen.getByLabelText(/dónde quieres trabajar/i), { target: { value: "A Coruña, La Coruña, Galicia, ESP" } });
    fireEvent.change(screen.getByLabelText("Modalidad"), { target: { value: "HYBRID" } });
    expect(screen.getByTestId("bv-01-static-hero")).toHaveAttribute("data-state", "listening");
    expect(screen.getByText("Desarrollador Full Stack Junior")).toBeInTheDocument();
    expect(screen.getAllByText("A Coruña")).toHaveLength(1);
    expect(screen.getAllByText("Híbrido")).toHaveLength(2);
    expect(screen.getByLabelText(/empezar una búsqueda/i)).toBeInTheDocument();
  });
});
