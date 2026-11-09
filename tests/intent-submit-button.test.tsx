import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));

import { IntentSubmitButton } from "@/components/intent-submit-button";

describe("intent submit button", () => {
  beforeEach(() => useFormStatus.mockReset());

  it("shows the normal activation label", () => {
    useFormStatus.mockReturnValue({ pending: false });
    render(<IntentSubmitButton />);
    expect(screen.getByRole("button", { name: "Empezar búsqueda" })).toBeEnabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "false");
  });

  it("prevents double submit and announces real pending work", () => {
    useFormStatus.mockReturnValue({ pending: true });
    render(<IntentSubmitButton />);
    expect(screen.getByRole("button", { name: "Preparando búsqueda..." })).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
});
