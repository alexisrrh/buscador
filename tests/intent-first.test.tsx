import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntentEntry } from "@/components/intent-entry";
import { OfferPreparationContextCard } from "@/components/offer-preparation-context";
import {
  offerPreparationContextFromQuery,
  offerPreparationDestination,
  opportunitiesDestination,
  intentFromQuery,
  intentQuery,
  preparationCtaDestination,
  resumeContinuationDestination,
  safeReturnTarget,
  searchIntent,
} from "@/lib/intent-first";

describe("intent-first entry", () => {
  it("requires a role while keeping location optional and mode simple", () => {
    expect(() => searchIntent({ role: "" })).toThrow();
    expect(searchIntent({ role: "Enfermera" })).toEqual({
      role: "Enfermera",
      location: "",
      workMode: "ANY",
    });
  });

  it("preserves only the three non-sensitive onboarding fields for a visitor", () => {
    const intent = searchIntent({ role: "Frontend Developer", location: "A Coruña", workMode: "REMOTE" });
    expect(intentFromQuery(Object.fromEntries(new URLSearchParams(intentQuery(intent))))).toEqual(intent);
    expect(opportunitiesDestination(intent)).toBe("/oportunidades?intent_role=Frontend+Developer&intent_mode=REMOTE&intent_location=A+Coru%C3%B1a");
  });

  it("preserves the selected offer and a constrained return target for the auth gate", () => {
    const intent = searchIntent({ role: "Frontend Developer", workMode: "REMOTE" });
    const destination = resumeContinuationDestination(intent, {
      title: "Frontend Developer",
      url: "https://jobs.example.test/frontend",
    });
    expect(destination).toContain("offer_title=Frontend+Developer");
    expect(destination).toContain("offer_url=https%3A%2F%2Fjobs.example.test%2Ffrontend");
    expect(destination).toContain("action=prepare");
    expect(destination).toContain("return_to=%2Foportunidades%3F");
  });

  it("sends an anonymous visitor through auth and an authenticated visitor directly to the contextual resume handoff", () => {
    const intent = searchIntent({ role: "Frontend Developer", location: "España", workMode: "REMOTE" });
    const offer = { title: "Frontend Engineer", url: "https://jobs.example.test/frontend" };
    expect(preparationCtaDestination(intent, offer, false)).toMatch(/^\/register\?.*return_to=/);
    expect(preparationCtaDestination(intent, offer, true)).toMatch(/^\/resumes\?.*action=prepare/);
  });

  it("validates the offer handoff and rejects unsafe URLs or return targets", () => {
    const context = offerPreparationContextFromQuery({
      intent_role: "Frontend Developer", intent_location: "España", intent_mode: "REMOTE",
      offer_title: "Frontend Engineer", offer_url: "https://jobs.example.test/frontend", action: "prepare",
      return_to: "/oportunidades?intent_role=Frontend+Developer",
    });
    expect(context).toMatchObject({ offerTitle: "Frontend Engineer", action: "prepare" });
    expect(context && offerPreparationDestination(context)).toContain("/resumes?intent_role=Frontend+Developer");
    expect(offerPreparationContextFromQuery({
      intent_role: "Frontend Developer", intent_mode: "REMOTE", offer_title: "Unsafe", offer_url: "javascript:alert(1)", action: "prepare",
    })).toBeNull();
    expect(safeReturnTarget("https://attacker.example", "/resumes")).toBe("/resumes");
  });

  it("keeps only a valid selected resume id in contextual offer state", () => {
    const context = offerPreparationContextFromQuery({
      intent_role: "Frontend Developer", intent_mode: "REMOTE", offer_title: "Frontend Engineer",
      offer_url: "https://jobs.example.test/frontend", action: "prepare",
      resume_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(context?.resumeId).toBe("00000000-0000-4000-8000-000000000001");
    expect(offerPreparationContextFromQuery({
      intent_role: "Frontend Developer", intent_mode: "REMOTE", offer_title: "Frontend Engineer",
      offer_url: "https://jobs.example.test/frontend", action: "prepare", resume_id: "foreign-id",
    })?.resumeId).toBeNull();
  });

  it("renders offer context only for a valid preparation handoff", () => {
    const context = offerPreparationContextFromQuery({
      intent_role: "Frontend Developer", intent_mode: "REMOTE", offer_title: "Frontend Engineer",
      offer_url: "https://jobs.example.test/frontend", action: "prepare",
    });
    const { rerender } = render(<OfferPreparationContextCard context={context} />);
    expect(screen.getByRole("heading", { name: "Frontend Engineer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver oferta original/i })).toHaveAttribute("href", "https://jobs.example.test/frontend");
    rerender(<OfferPreparationContextCard context={null} />);
    expect(screen.queryByLabelText("Contexto de candidatura")).not.toBeInTheDocument();
  });

  it("renders an accessible, model-free mobile-friendly entry form", () => {
    render(<IntentEntry intent={{ role: "Administrativo", location: "", workMode: "ANY" }} />);
    expect(screen.getByLabelText("¿Qué trabajo estás buscando?")).toBeRequired();
    expect(screen.getByLabelText(/Ubicación/)).not.toBeRequired();
    expect(screen.getByRole("radio", { name: "Cualquiera" })).toBeChecked();
    expect(screen.getByRole("button", { name: /Encontrar oportunidades/i })).toBeInTheDocument();
    expect(screen.queryByText(/CandidateProfile|SearchProfile|JobPreferences/)).not.toBeInTheDocument();
  });
});
