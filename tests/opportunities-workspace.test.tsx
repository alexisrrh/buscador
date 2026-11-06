import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/lib/job-sources/public-opportunities.server", () => ({
  searchPublicOpportunities: mocks.search,
  searchPublicOpportunitiesForIntent: mocks.search,
}));
vi.mock("@/lib/supabase/server", () => ({ requireUser: mocks.requireUser }));

import OpportunitiesPage from "@/app/oportunidades/page";

const resultWithOneOffer = {
  opportunities: [{
    title: "Frontend Developer", companyName: "Catalog Company", locationText: "A Coruña, Spain", workMode: "REMOTE",
    sourceName: "Ashby", sourceUrl: "https://jobs.example.test/frontend", canonicalUrl: "https://jobs.example.test/frontend",
    publishedAt: "2026-09-01T00:00:00.000Z", description: "Build user-facing experiences with TypeScript.", intentScore: 91,
    salaryMin: 30000, salaryMax: 42000, salaryCurrency: "EUR",
  }],
  catalogOffersLoaded: 1, offersEvaluated: 1, discardedRole: 0, discardedSeniority: 0, discardedLocationMode: 0,
  discardedThreshold: 0, catalogQueryMs: 1, relevanceMs: 1, rankingMs: 1, durationMs: 1,
};

describe("BV-01 opportunities workspace", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ user: null });
    mocks.search.mockResolvedValue(resultWithOneOffer);
  });

  it("presents only real result fields and real offer actions", async () => {
    render(await OpportunitiesPage({ searchParams: Promise.resolve({ intent_role: "Frontend Developer", intent_mode: "REMOTE", intent_location: "A Coruña" }) }));

    expect(screen.getByRole("heading", { name: "Resultados para tu búsqueda" })).toBeInTheDocument();
    expect(screen.getByText("1 oportunidad encontrada")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /(Preparando BV-01|BV-01 disponible)/i })).toHaveAttribute("data-state", "search_results");
    expect(screen.getByText("Catalog Company")).toBeInTheDocument();
    expect(screen.getByText("Fuente: Ashby")).toBeInTheDocument();
    expect(screen.getByTitle("A Coruña, Spain")).toBeInTheDocument();
    expect(screen.getAllByText("Remoto")).toHaveLength(2);
    expect(screen.getByText("30.000–42.000 EUR")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver oferta" })).toHaveAttribute("href", "https://jobs.example.test/frontend");
    expect(screen.getByRole("link", { name: "Preparar mi candidatura" })).toHaveAttribute("href", expect.stringMatching(/^\/register\?/));
    expect(screen.queryByText(/compatible|top match|recomienda/i)).not.toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("uses the real plural count without inventing compatibility labels", async () => {
    mocks.search.mockResolvedValue({ ...resultWithOneOffer, opportunities: [...resultWithOneOffer.opportunities, { ...resultWithOneOffer.opportunities[0], title: "Backend Developer", sourceUrl: "https://jobs.example.test/backend" }] });
    render(await OpportunitiesPage({ searchParams: Promise.resolve({ intent_role: "Developer", intent_mode: "ANY" }) }));

    expect(screen.getByText("2 oportunidades encontradas")).toBeInTheDocument();
    expect(screen.queryByText(/score|compatibilidad|recomendado por ia/i)).not.toBeInTheDocument();
  });

  it("keeps the real zero-results state without a success label", async () => {
    mocks.search.mockResolvedValue({ ...resultWithOneOffer, opportunities: [] });
    render(await OpportunitiesPage({ searchParams: Promise.resolve({ intent_role: "Enfermera", intent_mode: "ANY" }) }));

    expect(screen.getByRole("heading", { name: /No encontramos oportunidades/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /(Preparando BV-01|BV-01 disponible)/i })).toHaveAttribute("data-state", "idle");
    expect(screen.queryByText(/RESULTADOS LISTOS/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ajustar búsqueda" })).toBeInTheDocument();
  });
});
