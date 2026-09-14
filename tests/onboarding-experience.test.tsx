import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OnboardingSnapshot } from "@/lib/onboarding/state";

const mocks = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("@/app/actions/onboarding", () => ({ confirmOnboardingSignal: mocks.confirm }));

import { OnboardingExperience } from "@/components/onboarding-experience";

function snapshot(overrides: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot {
  return {
    state: "ROLE_REQUIRED",
    nextSignal: "ROLE",
    optionalSignals: ["LOCATION", "SALARY"],
    candidateProfile: { state: "NONE", id: null },
    role: { value: null, source: "UNKNOWN" },
    location: { value: null, source: "UNKNOWN", preferenceState: "UNKNOWN" },
    modality: { value: null, source: "UNKNOWN", preferenceState: "UNKNOWN", explicitlyUnrestricted: false },
    salary: { minimum: null, currency: null, source: "UNKNOWN", preferenceState: "UNKNOWN" },
    approvedResume: { state: "NONE", id: null },
    searchReady: false,
    preparationReady: false,
    ...overrides,
  };
}

function modeSnapshot(mode: "REMOTE" | "ANY" | null = null) {
  return snapshot({
    state: "MODE_DECISION",
    nextSignal: "MODALITY",
    candidateProfile: { state: "RESOLVED", id: "profile-1" },
    role: { value: "Frontend Developer", source: "PERSISTED_PREFERENCE" },
    modality: mode ? { value: mode, source: "PERSISTED_PREFERENCE", preferenceState: mode === "ANY" ? "UNRESTRICTED" : "SPECIFIED", explicitlyUnrestricted: mode === "ANY" } : { value: null, source: "UNKNOWN", preferenceState: "UNKNOWN", explicitlyUnrestricted: false },
  });
}

afterEach(() => vi.clearAllMocks());

describe("BV-01 interactive onboarding", () => {
  it("renders only the next required signal for a new user", () => {
    render(<OnboardingExperience initialSnapshot={snapshot()} />);
    expect(screen.getByText("Hola. Yo me encargo de buscar por ti. Primero necesito saber una cosa.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "¿Qué trabajo quieres conseguir?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Trabajo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remoto" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Salario mínimo anual")).not.toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
    expect(screen.queryByText("Opcional")).not.toBeInTheDocument();
  });

  it("does not render a detached BV-01 status box or a passive onboarding branch", () => {
    render(<OnboardingExperience initialSnapshot={snapshot()} />);
    expect(screen.queryByText("BV-01", { selector: ".bv-01__status" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Trabajo" })).toBeInTheDocument();
  });

  it("shows remembered data as memory rather than asking it again", () => {
    render(<OnboardingExperience initialSnapshot={modeSnapshot()} />);
    expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "¿Cómo prefieres trabajar?" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Trabajo")).not.toBeInTheDocument();
  });

  it("moves BV-01 into listening while the user writes a role", () => {
    render(<OnboardingExperience initialSnapshot={snapshot()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Trabajo" }), { target: { value: "Frontend Developer" } });
    expect(screen.getByRole("img", { name: /escuchando tu respuesta/i })).toBeInTheDocument();
  });

  it("keeps a typed role on the workspace after a safe persistence failure", async () => {
    mocks.confirm.mockResolvedValue({ ok: false, error: { code: "PERSISTENCE_FAILED", message: "internal" } });
    render(<OnboardingExperience initialSnapshot={snapshot()} />);
    const input = screen.getByRole("textbox", { name: "Trabajo" });
    fireEvent.change(input, { target: { value: "Frontend Developer" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByRole("img", { name: /no pudo guardar/i })).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Trabajo" })).toHaveValue("Frontend Developer");
  });

  it("offers a useful contextual confirmation when canonical state requires a search profile but has no nextSignal", () => {
    render(<OnboardingExperience initialSnapshot={snapshot({
      state: "SEARCH_PROFILE_REQUIRED",
      nextSignal: null,
      candidateProfile: { state: "RESOLVED", id: "profile-1" },
      role: { value: "Frontend Developer", source: "CURRENT_INTENT" },
      modality: { value: "REMOTE", source: "CURRENT_INTENT", preferenceState: "SPECIFIED", explicitlyUnrestricted: false },
    })} />);

    expect(screen.getByRole("heading", { name: /Entiendo que buscas trabajo como Frontend Developer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, continuar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(screen.getByRole("textbox", { name: "Trabajo" })).toHaveValue("Frontend Developer");
    expect(screen.queryByText("BuscaVacante está preparando tu búsqueda")).not.toBeInTheDocument();
  });

  it("shows a saving state and updates memory only after the canonical success response", async () => {
    let settle: ((value: unknown) => void) | undefined;
    mocks.confirm.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    render(<OnboardingExperience initialSnapshot={modeSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Me da igual" }));
    expect(screen.getByRole("img", { name: /guardando la señal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remoto" })).toBeDisabled();
    expect(screen.getByText("Sin restricción")).toHaveClass("onboarding-token");
    expect(within(screen.queryByRole("complementary", { name: "Memoria de BV-01" }) ?? document.body).queryByText("Sin restricción")).not.toBeInTheDocument();

    settle?.({ ok: true, snapshot: snapshot({
      state: "SEARCH_READY", nextSignal: null, searchReady: true,
      candidateProfile: { state: "RESOLVED", id: "profile-1" }, role: { value: "Frontend Developer", source: "PERSISTED_PREFERENCE" },
      modality: { value: "ANY", source: "PERSISTED_PREFERENCE", preferenceState: "UNRESTRICTED", explicitlyUnrestricted: true },
    }), nextSignal: null });

    await waitFor(() => expect(screen.getByText("Sin restricción")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Empezar a buscar" })).toHaveAttribute("href", "/oportunidades?intent_role=Frontend+Developer&intent_mode=ANY");
    expect(mocks.confirm).toHaveBeenCalledWith({ signal: "MODE", value: "UNRESTRICTED" });
  });

  it("keeps the active answer and does not advance after a safe failure", async () => {
    mocks.confirm.mockResolvedValue({ ok: false, error: { code: "PERSISTENCE_FAILED", message: "internal" } });
    render(<OnboardingExperience initialSnapshot={modeSnapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remoto" }));
    await waitFor(() => expect(screen.getByText("No pude guardar eso. Vamos a intentarlo otra vez.")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "¿Cómo prefieres trabajar?" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /no pudo guardar/i })).toBeInTheDocument();
  });

  it("renders the ready state without a Profile redirect and offers optional signals separately", () => {
    render(<OnboardingExperience initialSnapshot={snapshot({
      state: "SEARCH_READY", nextSignal: null, searchReady: true,
      candidateProfile: { state: "RESOLVED", id: "profile-1" }, role: { value: "Frontend Developer", source: "PERSISTED_PREFERENCE" },
      modality: { value: "REMOTE", source: "PERSISTED_PREFERENCE", preferenceState: "SPECIFIED", explicitlyUnrestricted: false },
      approvedResume: { state: "SINGLE_APPROVED", id: "resume-1" },
    })} />);
    expect(screen.getByRole("heading", { name: "Ya tengo suficiente." })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /listo para buscar oportunidades/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Empezar a buscar" })).toHaveAttribute("href", "/oportunidades?intent_role=Frontend+Developer&intent_mode=REMOTE");
    expect(screen.getByText("Conectado")).toBeInTheDocument();
    expect(screen.queryByText(/CandidateProfile|SearchProfile|JobPreferences/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Añadir ubicación" }));
    expect(screen.getByRole("heading", { name: "¿Quieres limitar la búsqueda a algún lugar?" })).toBeInTheDocument();
  });

  it("keeps unrestricted location and salary as human-readable remembered decisions", () => {
    render(<OnboardingExperience initialSnapshot={snapshot({
      state: "SEARCH_READY", nextSignal: null, searchReady: true,
      candidateProfile: { state: "RESOLVED", id: "profile-1" }, role: { value: "Frontend Developer", source: "PERSISTED_PREFERENCE" },
      modality: { value: "REMOTE", source: "PERSISTED_PREFERENCE", preferenceState: "SPECIFIED", explicitlyUnrestricted: false },
      location: { value: null, source: "PERSISTED_PREFERENCE", preferenceState: "UNRESTRICTED" },
      salary: { minimum: null, currency: null, source: "PERSISTED_PREFERENCE", preferenceState: "UNRESTRICTED" },
      optionalSignals: [],
    })} />);
    expect(screen.getAllByText("Sin restricción")).toHaveLength(1);
    expect(screen.getByText("Sin mínimo")).toBeInTheDocument();
  });

  it("offers explicit unrestricted choices for optional signals", async () => {
    mocks.confirm.mockResolvedValue({ ok: false, error: { code: "PERSISTENCE_FAILED", message: "internal" } });
    const view = render(<OnboardingExperience initialSnapshot={snapshot({
      state: "SEARCH_READY", nextSignal: null, searchReady: true,
      candidateProfile: { state: "RESOLVED", id: "profile-1" }, role: { value: "Frontend Developer", source: "PERSISTED_PREFERENCE" },
      modality: { value: "REMOTE", source: "PERSISTED_PREFERENCE", preferenceState: "SPECIFIED", explicitlyUnrestricted: false },
    })} />);

    fireEvent.click(screen.getByRole("button", { name: "Añadir ubicación" }));
    fireEvent.click(screen.getByRole("button", { name: "Sin restricción" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith({ signal: "LOCATION", value: "UNRESTRICTED" }));

    view.unmount();
    render(<OnboardingExperience initialSnapshot={snapshot({
      state: "SEARCH_READY", nextSignal: null, searchReady: true,
      candidateProfile: { state: "RESOLVED", id: "profile-1" }, role: { value: "Frontend Developer", source: "PERSISTED_PREFERENCE" },
      modality: { value: "REMOTE", source: "PERSISTED_PREFERENCE", preferenceState: "SPECIFIED", explicitlyUnrestricted: false },
    })} />);
    fireEvent.click(screen.getByRole("button", { name: "Añadir salario" }));
    fireEvent.click(screen.getByRole("button", { name: "Sin mínimo" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith({ signal: "SALARY", value: "UNRESTRICTED" }));
  });

  it("keeps reduced-motion support in the onboarding stylesheet", () => {
    const styles = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation-duration: .01ms !important");
  });
});
