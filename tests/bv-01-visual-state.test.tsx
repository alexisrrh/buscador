import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroActivityPanel } from "@/components/hero-activity-panel";
import { HeroAgentStatus } from "@/components/hero-agent-status";
import { bv01VisualStateMap, type BV01VisualState } from "@/lib/bv01-visual-state";

const cases: Array<[BV01VisualState, string, string]> = [
  ["IDLE", "EN ESPERA", "Esperando una preferencia"],
  ["LISTENING", "ESCUCHANDO", "Preferencia introducida"],
  ["SAVING", "GUARDANDO", "Guardando preferencia"],
  ["SEARCHING", "BUSCANDO", "Buscando oportunidades"],
  ["SEARCH_READY", "LISTO", "Busqueda preparada"],
  ["SEARCH_RESULTS", "RESULTADOS LISTOS", "Oportunidades encontradas"],
  ["ERROR", "ERROR", "Error al guardar la preferencia"],
];

describe("BV-01 real visual state mapping", () => {
  it("contains only the five permitted states", () => {
    expect(Object.keys(bv01VisualStateMap)).toEqual(["IDLE", "LISTENING", "SAVING", "SEARCHING", "SEARCH_READY", "SEARCH_RESULTS", "ERROR"]);
  });

  it.each(cases)("renders %s status, activity, and state attributes", (state, status, activity) => {
    render(<><HeroAgentStatus state={state} /><HeroActivityPanel state={state} /></>);
    expect(screen.getByLabelText(`Estado de BV-01: ${status}`)).toHaveAttribute("data-state", state.toLowerCase());
    expect(screen.getByLabelText("Actividad de la sesión")).toHaveAttribute("data-state", state.toLowerCase());
    expect(screen.getByText(activity)).toBeInTheDocument();
  });

  it("uses the real error message when one is available", () => {
    render(<HeroActivityPanel state="ERROR" error="No se pudo guardar la preferencia." />);
    expect(screen.getByText("No se pudo guardar la preferencia.")).toBeInTheDocument();
  });
});
