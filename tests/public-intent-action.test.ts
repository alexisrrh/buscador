import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (target: string) => { throw new Error(`redirect:${target}`); },
}));

import { beginSearchIntent } from "@/app/actions/intent";

describe("public intent action", () => {
  it("sends an anonymous search straight to public opportunities, never registration", async () => {
    const form = new FormData();
    form.set("role", "Frontend Developer");
    form.set("location", "A Coruña");
    form.set("work_mode", "REMOTE");
    await expect(beginSearchIntent(form)).rejects.toThrow(
      "redirect:/oportunidades?intent_role=Frontend+Developer&intent_mode=REMOTE&intent_location=A+Coru%C3%B1a",
    );
  });
});
