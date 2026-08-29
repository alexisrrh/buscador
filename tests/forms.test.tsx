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
    expect(screen.getByLabelText("¿Cómo quieres llamar a este perfil?")).toHaveValue("Frontend");
    expect(screen.getByLabelText("¿Cómo quieres presentarte profesionalmente?")).toBeInTheDocument();
    expect(screen.getByLabelText("¿En qué área quieres trabajar?")).toBeInTheDocument();
    expect(screen.getByLabelText("¿Qué nivel de experiencia tienes?")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado del perfil")).toHaveValue("Activo");
  });

  it("presents search settings as natural questions", () => {
    render(<SearchForm action={vi.fn()} profiles={[profile]} />);
    expect(screen.getByLabelText("¿Qué trabajo estás buscando?")).toBeInTheDocument();
    expect(screen.getByLabelText("¿Dónde quieres trabajar?")).toBeInTheDocument();
    expect(screen.getByLabelText("¿Cada cuánto quieres que busquemos nuevas ofertas?")).toBeInTheDocument();
    expect(screen.getByLabelText("¿A partir de qué compatibilidad quieres recibir avisos?")).toHaveAttribute("max", "100");
    expect(screen.getByText(/No hay postulación automática activa/i)).toBeInTheDocument();
    expect(screen.getByLabelText("¿Qué tecnologías o conocimientos quieres que tengan las ofertas?")).toBeInTheDocument();
  });
});
