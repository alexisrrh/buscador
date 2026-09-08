import { describe, expect, it } from "vitest";
import { normalizeIdentityPart, structuredUserIdentity } from "@/lib/user-identity";

describe("structured user identity", () => {
  it("normalizes and supports saving then editing both identity parts", () => {
    const saved = structuredUserIdentity({ first_name: "  Ana  María ", last_name: "  Pérez   López " });
    expect(saved).toEqual({ first_name: "Ana María", last_name: "Pérez López" });
    const edited = structuredUserIdentity({ first_name: "Ana", last_name: "García" });
    expect(edited).toEqual({ first_name: "Ana", last_name: "García" });
  });

  it("rejects empty and professional-title values", () => {
    expect(structuredUserIdentity({ first_name: "", last_name: "Pérez" })).toBeNull();
    expect(structuredUserIdentity({ first_name: "Frontend", last_name: "Developer" })).toBeNull();
    expect(normalizeIdentityPart("   ")).toBe("");
  });
});
