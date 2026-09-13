import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useFormStatus = vi.hoisted(() => vi.fn());
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));

import { RegisterSubmitButton } from "@/components/register-submit-button";

describe("RegisterSubmitButton", () => {
  beforeEach(() => useFormStatus.mockReset());

  it("renders the normal submit label", () => {
    useFormStatus.mockReturnValue({ pending: false });
    render(<RegisterSubmitButton />);
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
  });

  it("renders an accessible disabled pending state", () => {
    useFormStatus.mockReturnValue({ pending: true });
    render(<RegisterSubmitButton />);
    const button = screen.getByRole("button", { name: "Creando tu cuenta…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("returns to the normal usable state after a failed submission completes", () => {
    useFormStatus.mockReturnValue({ pending: true });
    const view = render(<RegisterSubmitButton />);
    expect(screen.getByRole("button", { name: "Creando tu cuenta…" })).toBeDisabled();

    useFormStatus.mockReturnValue({ pending: false });
    view.rerender(<RegisterSubmitButton />);
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
  });
});
