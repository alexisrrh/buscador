import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntentEntry } from "@/components/intent-entry";
import {
  opportunitiesDestination,
  intentFromQuery,
  intentQuery,
  resumeContinuationDestination,
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

  it("renders an accessible, model-free mobile-friendly entry form", () => {
    render(<IntentEntry intent={{ role: "Administrativo", location: "", workMode: "ANY" }} />);
    expect(screen.getByLabelText("¿Qué trabajo estás buscando?")).toBeRequired();
    expect(screen.getByLabelText(/Ubicación/)).not.toBeRequired();
    expect(screen.getByRole("radio", { name: "Cualquiera" })).toBeChecked();
    expect(screen.getByRole("button", { name: /Encontrar oportunidades/i })).toBeInTheDocument();
    expect(screen.queryByText(/CandidateProfile|SearchProfile|JobPreferences/)).not.toBeInTheDocument();
  });
});
