import { describe, expect, it } from "vitest";
import { displayIntentLocation, displayIntentRole, displayIntentWorkMode } from "@/lib/intent-display";

describe("intent display labels", () => {
  it("shortens a composite location only for presentation", () => {
    expect(displayIntentLocation("A Coruña, La Coruña, Galicia, ESP")).toBe("A Coruña");
  });

  it("formats role and work mode without changing their canonical values", () => {
    expect(displayIntentRole("desarrollador full stack junior")).toBe("Desarrollador Full Stack Junior");
    expect(displayIntentWorkMode("ONSITE")).toBe("Presencial");
  });
});
