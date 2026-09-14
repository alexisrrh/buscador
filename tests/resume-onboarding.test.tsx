import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ approve: vi.fn() }));

vi.mock("@/app/actions/resumes", () => ({ approveResume: mocks.approve }));
vi.mock("@/components/resume-uploader", () => ({
  ResumeUploader: ({ profiles, contextual, autoApproveFirst, heading, submitLabel }: {
    profiles: { id: string }[];
    contextual?: boolean;
    autoApproveFirst?: boolean;
    heading?: string;
    submitLabel?: string;
  }) => <div data-testid="uploader" data-profiles={profiles.length} data-contextual={String(contextual)} data-auto-approve={String(autoApproveFirst)}><h2>{heading}</h2><button>{submitLabel}</button></div>,
}));

import { ResumeOnboarding } from "@/components/resume-onboarding";
import { offerPreparationDestination, type OfferPreparationContext } from "@/lib/intent-first";
import type { ContextualOnboarding } from "@/lib/resumes/contextual-onboarding.server";

const intent = { role: "Frontend Developer", location: "España", workMode: "REMOTE" as const };
const context: OfferPreparationContext = {
  intent,
  offerTitle: "Frontend Engineer",
  offerUrl: "https://example.com/jobs/frontend",
  action: "prepare",
  returnTo: "/oportunidades?intent_role=Frontend+Developer&intent_mode=REMOTE&intent_location=Espa%C3%B1a",
  resumeId: null,
};
const profile = { id: "profile-a", name: "Frontend" };
const readyResume = { id: "00000000-0000-4000-8000-000000000001", candidate_profile_id: profile.id, original_filename: "cv.pdf", status: "READY" as const, created_at: "" };
const approvedResume = { ...readyResume, status: "APPROVED" as const };

function onboarding(overrides: Partial<ContextualOnboarding> = {}): ContextualOnboarding {
  return { state: "NO_RESUME", profile: null, resume: null, resumes: [], profileChoices: [], ...overrides };
}

describe("simple CV onboarding", () => {
  it("gives a new contextual user one upload path without internal lifecycle language", () => {
    render(<ResumeOnboarding context={context} intent={intent} onboarding={onboarding()} />);

    expect(screen.getByRole("heading", { name: "Prepara tu candidatura para Frontend Engineer" })).toBeInTheDocument();
    expect(screen.getByText(/utilizará tu experiencia real/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver oferta original" })).toHaveAttribute("href", context.offerUrl);
    expect(screen.getByTestId("uploader")).toHaveAttribute("data-contextual", "true");
    expect(screen.getByTestId("uploader")).toHaveAttribute("data-profiles", "0");
    expect(screen.getByTestId("uploader")).toHaveAttribute("data-auto-approve", "true");
    expect(screen.queryByText(/versión|processing|approved|evidence bank|candidateprofile/i)).not.toBeInTheDocument();
  });

  it("lets a new user without an offer upload the first CV directly", () => {
    render(<ResumeOnboarding context={null} intent={intent} onboarding={onboarding()} />);

    expect(screen.getByRole("heading", { name: "Sube tu CV" })).toBeInTheDocument();
    expect(screen.getByText(/encontrar oportunidades compatibles/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir mi CV" })).toBeInTheDocument();
    expect(screen.getByTestId("uploader")).toHaveAttribute("data-contextual", "true");
  });

  it("keeps every contextual parameter when an ambiguous CV needs approval", () => {
    render(<ResumeOnboarding context={context} intent={intent} onboarding={onboarding({ state: "READY_RESUME", profile, resume: readyResume, resumes: [readyResume] })} />);

    const expected = offerPreparationDestination({ ...context, resumeId: readyResume.id });
    expect(screen.getByDisplayValue(expected)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usar este CV" })).toBeInTheDocument();
  });

  it("keeps an explicit choice when there are multiple CVs", () => {
    render(<ResumeOnboarding context={context} intent={intent} onboarding={onboarding({ state: "AMBIGUOUS", resumes: [readyResume, { ...approvedResume, id: "00000000-0000-4000-8000-000000000002" }] })} />);

    expect(screen.getByRole("heading", { name: "¿Cuál quieres usar?" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Usar este CV" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Usar este CV" })).toBeInTheDocument();
  });

  it("continues to a real offer or opportunities and never promises a prepared application", () => {
    const { rerender } = render(<ResumeOnboarding context={context} intent={intent} onboarding={onboarding({ state: "APPROVED_RESUME", profile, resume: approvedResume, resumes: [approvedResume] })} />);
    expect(screen.getByRole("link", { name: "Continuar con la oferta" })).toHaveAttribute("href", context.offerUrl);
    expect(screen.queryByText(/candidatura lista|candidatura preparada/i)).not.toBeInTheDocument();

    rerender(<ResumeOnboarding context={null} intent={intent} onboarding={onboarding({ state: "APPROVED_RESUME", profile, resume: approvedResume, resumes: [approvedResume] })} />);
    expect(screen.getByRole("link", { name: "Ver oportunidades" })).toHaveAttribute("href", "/oportunidades?intent_role=Frontend+Developer&intent_mode=REMOTE&intent_location=Espa%C3%B1a");
    expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument();
  });
});
