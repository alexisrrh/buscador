import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SearchStatusActions } from "@/components/search-status-actions";

describe("SearchProfile status actions", () => {
  it("shows the primary activation action for a draft card", () => {
    render(<SearchStatusActions
      id="71100000-0000-0000-0000-000000000001"
      status="DRAFT"
      editHref="/searches/71100000-0000-0000-0000-000000000001"
      editLabel="Continuar"
    />);

    expect(screen.getByRole("link", { name: "Continuar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar búsqueda" })).toBeInTheDocument();
  });

  it("offers pause for active and reactivation for paused searches", () => {
    const { rerender } = render(<SearchStatusActions id="active" status="ACTIVE" editHref="/searches/active" />);
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();

    rerender(<SearchStatusActions id="paused" status="PAUSED" editHref="/searches/paused" />);
    expect(screen.getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
  });
});
