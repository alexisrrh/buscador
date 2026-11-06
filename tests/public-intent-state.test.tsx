import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/intent-entry", () => ({
  IntentEntry: ({ onSearchStarted }: { onSearchStarted?: () => void }) => <button type="button" onClick={() => onSearchStarted?.()}>Activar estado real</button>,
}));

import { PublicIntentExperience } from "@/components/public-intent-experience";

describe("public BV-01 state mapping", () => {
  it("maps the real search-start callback to BV-01's activating state", () => {
    render(<PublicIntentExperience intent={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Activar estado real" }));
    expect(screen.getByTestId("bv-01-static-hero")).toHaveAttribute("data-state", "saving");
  });
});
