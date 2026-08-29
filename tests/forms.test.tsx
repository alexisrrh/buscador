import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/components/profile-form";
import { SearchForm } from "@/components/search-form";

const profile = {
  id: "profile-a", user_id: "user-a", name: "Frontend", headline: null,
  job_family: null, seniority: null, created_at: "", updated_at: "", deleted_at: null,
};

describe("MVP forms", () => {
  it("renders all CandidateProfile fields and derived status", () => {
    render(<ProfileForm action={vi.fn()} profile={profile} />);
    expect(screen.getByLabelText("Nombre del perfil")).toHaveValue("Frontend");
    expect(screen.getByLabelText("Headline")).toBeInTheDocument();
    expect(screen.getByLabelText("Familia profesional")).toBeInTheDocument();
    expect(screen.getByLabelText("Seniority")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toHaveValue("ACTIVE");
  });

  it("shows search constraints without claiming auto-apply exists", () => {
    render(<SearchForm action={vi.fn()} profiles={[profile]} />);
    expect(screen.getByLabelText("Score para notificar")).toHaveAttribute("max", "100");
    expect(screen.getByLabelText("Umbral reservado automático")).toBeInTheDocument();
    expect(screen.getByText(/no activa auto-apply/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Keywords")).toBeInTheDocument();
    expect(screen.getByLabelText("Tecnologías requeridas")).toBeInTheDocument();
  });
});
