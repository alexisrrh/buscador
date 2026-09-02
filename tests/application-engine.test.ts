import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ManualOnlyConnector } from "@/lib/application-engine/connectors";
import { determineApplicationMode } from "@/lib/application-engine/decision";
import { classifyApplicationQuestion } from "@/lib/application-engine/questions";
import type { ApplicationDecisionInput, ApplicationQuestion, ConnectorCapabilities } from "@/lib/application-engine/types";

const applicationPage = readFileSync("app/(private)/applications/[id]/page.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260902000200_phase8_application_engine.sql", "utf8");

const capableConnector: ConnectorCapabilities = {
  supportsDirectApply: true, supportsResumeUpload: true, supportsCoverLetter: true,
  supportsQuestions: true, requiresAuthentication: false, supportsAutoSubmit: true,
};

function base(overrides: Partial<ApplicationDecisionInput> = {}): ApplicationDecisionInput {
  return {
    draftStatus: "APPROVED", resumeStatus: "APPROVED", offerStatus: "ACTIVE",
    eligibility: "ELIGIBLE", score: 95, minimumScore: 90, searchApplicationMode: "AUTO",
    userAutoApplyEnabled: true, sourceAutoApplyEnabled: true, connector: capableConnector, questions: [], hardRequirementsMissing: [],
    duplicateExists: false, dailyLimit: 10, applicationsToday: 0, hasCaptcha: false,
    hasAssessment: false, hasComplexAuthentication: false, hasUnsupportedDynamicForm: false,
    hasUnexpectedConsent: false, ...overrides,
  };
}

function question(text: string, overrides: Partial<ApplicationQuestion> = {}): ApplicationQuestion {
  return {
    questionKey: "question", questionText: text, answerType: "TEXT", classification: classifyApplicationQuestion(text),
    answerValue: null, source: "PORTAL_DISCOVERY", confidence: 0, requiresConfirmation: true, ...overrides,
  };
}

describe("Phase 8 application decision engine", () => {
  it("blocks an unapproved draft", () => {
    const result = determineApplicationMode(base({ draftStatus: "READY_FOR_REVIEW" }));
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain("APPLICATION_DRAFT_NOT_APPROVED");
  });

  it("blocks a rejected match", () => {
    expect(determineApplicationMode(base({ eligibility: "REJECTED" })).reasons).toContain("JOB_MATCH_REJECTED");
  });

  it("allows AUTO only when every safety gate passes", () => {
    expect(determineApplicationMode(base())).toMatchObject({ mode: "AUTO", blocked: false });
  });

  it.each(["Expected salary?", "Do you require sponsorship?"])("requires review for unknown answer: %s", (text) => {
    const result = determineApplicationMode(base({ questions: [question(text)] }));
    expect(result.mode).toBe("REVIEW");
    expect(result.confirmations).toContain(text);
  });

  it.each([
    ["captcha", { hasCaptcha: true }],
    ["assessment", { hasAssessment: true }],
  ])("uses MANUAL for %s", (_name, overrides) => {
    expect(determineApplicationMode(base(overrides)).mode).toBe("MANUAL");
  });

  it("uses MANUAL for an unsupported source", () => {
    expect(determineApplicationMode(base({ connector: null })).mode).toBe("MANUAL");
  });

  it("blocks when the daily limit is reached", () => {
    const result = determineApplicationMode(base({ dailyLimit: 10, applicationsToday: 10 }));
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain("DAILY_LIMIT_REACHED");
  });

  it("blocks a duplicate application decision", () => {
    const result = determineApplicationMode(base({ duplicateExists: true }));
    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain("DUPLICATE_APPLICATION");
  });

  it("never auto-answers legal-sensitive questions without explicit approval", () => {
    const sponsorship = question("Do you require sponsorship?", {
      answerType: "BOOLEAN", answerValue: false, source: "GENERATED", requiresConfirmation: false,
    });
    expect(determineApplicationMode(base({ questions: [sponsorship] })).mode).toBe("REVIEW");
    sponsorship.source = "USER_APPROVED";
    expect(determineApplicationMode(base({ questions: [sponsorship] })).mode).toBe("AUTO");
  });

  it("has no real submit implementation or frontend submit action", async () => {
    await expect(new ManualOnlyConnector().submit()).rejects.toThrow("REAL_SUBMISSION_NOT_IMPLEMENTED");
    expect(applicationPage).not.toMatch(/action={[^}]*submit/i);
    expect(applicationPage).toContain("no ha enviado esta candidatura");
    expect(migration).toContain("application_draft_id uuid not null");
  });
});
