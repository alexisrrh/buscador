import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/actions/intent", () => ({ beginSearchIntent: vi.fn(), startPublicSearchIntent: vi.fn() }));
import { IntentEntry } from "@/components/intent-entry";
import { startPublicSearchIntent } from "@/app/actions/intent";
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

  it("renders accessible optional location and work-mode controls on the landing form", () => {
    const { container } = render(<IntentEntry intent={{ role: "Administrativo", location: "A Coruña", workMode: "REMOTE" }} showSearchScope />);
    expect(screen.getByLabelText("¿Qué trabajo buscas?")).toBeRequired();
    expect(screen.getByPlaceholderText("Dime qué trabajo buscas...")).toHaveValue("Administrativo");
    expect(screen.getByLabelText("¿Dónde quieres trabajar?")).toHaveValue("A Coruña");
    expect(screen.getByLabelText("Modalidad")).toHaveValue("REMOTE");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar búsqueda" })).toBeInTheDocument();
    expect(container.querySelector('input[type="hidden"][name="location"]')).toBeNull();
    expect(container.querySelector('input[type="hidden"][name="work_mode"]')).toBeNull();
    expect(screen.queryByText(/CandidateProfile|SearchProfile|JobPreferences/)).not.toBeInTheDocument();
  });

  it("keeps location optional, supports remote without a destination, and exposes explicit scope changes", () => {
    const onLocationChange = vi.fn();
    const onWorkModeChange = vi.fn();
    render(<IntentEntry showSearchScope onLocationChange={onLocationChange} onWorkModeChange={onWorkModeChange} />);

    expect(screen.getByLabelText("¿Dónde quieres trabajar?")).toHaveValue("");
    expect(screen.getByLabelText("Modalidad")).toHaveValue("ANY");
    fireEvent.change(screen.getByLabelText("Modalidad"), { target: { value: "REMOTE" } });
    fireEvent.change(screen.getByLabelText("¿Dónde quieres trabajar?"), { target: { value: "A Coruña" } });
    expect(onWorkModeChange).toHaveBeenLastCalledWith("REMOTE");
    expect(onLocationChange).toHaveBeenLastCalledWith("A Coruña");
  });

  it("captures all fields before the first visual transition and preserves them when initiation fails", async () => {
    const onSearchStarted = vi.fn();
    vi.mocked(startPublicSearchIntent).mockResolvedValueOnce({ ok: false, error: "Error de prueba", errorDestination: "/" });
    render(<IntentEntry clientControlled showSearchScope onSearchStarted={onSearchStarted} />);

    fireEvent.change(screen.getByLabelText("¿Qué trabajo buscas?"), { target: { value: "Desarrollador Full Stack" } });
    fireEvent.change(screen.getByLabelText("¿Dónde quieres trabajar?"), { target: { value: "A Coruña" } });
    fireEvent.change(screen.getByLabelText("Modalidad"), { target: { value: "REMOTE" } });
    fireEvent.submit(screen.getByLabelText(/empezar una búsqueda/i));

    await waitFor(() => expect(startPublicSearchIntent).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(vi.mocked(startPublicSearchIntent).mock.calls[0][0])).toEqual({ role: "Desarrollador Full Stack", location: "A Coruña", work_mode: "REMOTE" });
    expect(onSearchStarted).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("¿Qué trabajo buscas?")).toHaveValue("Desarrollador Full Stack");
    expect(screen.getByLabelText("¿Dónde quieres trabajar?")).toHaveValue("A Coruña");
    expect(screen.getByLabelText("Modalidad")).toHaveValue("REMOTE");
  });
});
