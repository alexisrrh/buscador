import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/register-submit-button", () => ({ RegisterSubmitButton: () => <button type="submit">Crear cuenta</button> }));

import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";

const returnTo = "/resumes?intent_role=Frontend+Developer&intent_mode=REMOTE&intent_location=Espa%C3%B1a&offer_title=Frontend+Engineer&offer_url=https%3A%2F%2Fjobs.example.test%2Ffrontend&action=prepare&return_to=%2Foportunidades%3Fintent_role%3DFrontend%2BDeveloper%26intent_mode%3DREMOTE%26intent_location%3DEspa%25C3%25B1a";
const params = {
  intent_role: "Frontend Developer",
  intent_location: "España",
  intent_mode: "REMOTE",
  return_to: returnTo,
};

afterEach(cleanup);

describe("auth page contextual handoff", () => {
  it("keeps contextual query values in register hidden fields", async () => {
    render(await RegisterPage({ searchParams: Promise.resolve(params) }));
    expect(screen.getByDisplayValue("Frontend Developer")).toHaveAttribute("name", "intent_role");
    expect(screen.getByDisplayValue("España")).toHaveAttribute("name", "intent_location");
    expect(screen.getByDisplayValue("REMOTE")).toHaveAttribute("name", "intent_mode");
    expect(screen.getByDisplayValue(returnTo)).toHaveAttribute("name", "return_to");
  });

  it("preserves contextual query values through both auth cross-links", async () => {
    const register = render(await RegisterPage({ searchParams: Promise.resolve(params) }));
    expect(screen.getByRole("link", { name: /Inicia sesión/i })).toHaveAttribute("href", expect.stringContaining("return_to="));
    register.unmount();

    render(await LoginPage({ searchParams: Promise.resolve(params) }));
    expect(screen.getByRole("link", { name: /Regístrate/i })).toHaveAttribute("href", expect.stringContaining("return_to="));
  });
});
