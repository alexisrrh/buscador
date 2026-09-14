import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logout: vi.fn(), requireUser: vi.fn(), redirect: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logout: mocks.logout }));
vi.mock("@/lib/supabase/server", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import PrivateLayout from "@/app/(private)/layout";

describe("private navigation", () => {
  it("shows only live product destinations and sends the brand to opportunities", async () => {
    mocks.requireUser.mockResolvedValue({ user: { id: "user-a" } });
    render(await PrivateLayout({ children: <p>Contenido privado</p> }));

    expect(screen.queryByRole("link", { name: "Inicio" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oportunidades" })).toHaveAttribute("href", "/oportunidades");
    expect(screen.getByRole("link", { name: "BuscaVacante" })).toHaveAttribute("href", "/oportunidades");
    expect(screen.getByRole("link", { name: "Perfil" })).toHaveAttribute("href", "/profiles");
    expect(screen.queryByRole("link", { name: "Ofertas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Candidaturas" })).not.toBeInTheDocument();
  });
});
