import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequirementConfirmations } from "@/components/requirement-confirmations";

const action = vi.fn();
const requirement = { requirement: "TypeScript", classification: "MANDATORY" as const, status: "CONFIRMABLE" as const, severity: "IMPORTANT" as const, evidence_sources: [], confirmation_prompt: { skill: "TypeScript", context_required: ["context", "scope", "confirmed_at"] as ["context", "scope", "confirmed_at"] } };

describe("offer confirmation flow", () => {
  it("keeps the professional profile free of internal evidence-bank controls", () => {
    const page = readFileSync("app/(private)/profiles/[id]/page.tsx", "utf8");
    expect(page).not.toContain("ProfessionalEvidenceEditor");
    expect(page).not.toContain("professional_evidence_items");
  });

  it("asks only CONFIRMABLE requirements, with explicit yes/no and required context", () => {
    render(<RequirementConfirmations draftId="draft-a" requirements={[requirement]} subjects={[{ id: "project-a", subject_type: "PROJECT", display_name: "Portal" }]} confirmAction={action} declineAction={action} />);
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Sí, lo he usado")).toBeInTheDocument();
    expect(screen.getByText("No lo he usado")).toBeInTheDocument();
    expect(screen.getByLabelText("Dónde lo utilizaste")).toBeRequired();
    expect(screen.getByLabelText("Qué hiciste")).toBeRequired();
    expect(screen.queryByText("CONFIRMABLE")).not.toBeInTheDocument();
  });

  it("renders no question for verified requirements", () => {
    const { container } = render(<RequirementConfirmations draftId="draft-a" requirements={[]} subjects={[]} confirmAction={action} declineAction={action} />);
    expect(container).toBeEmptyDOMElement();
  });
});
