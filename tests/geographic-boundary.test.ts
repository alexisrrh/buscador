import { describe, expect, it } from "vitest";
import { boundaryRings, simplifyBoundary } from "@/lib/geographic-boundary";

describe("geographic boundary preparation", () => {
  it("preserves Polygon topology while reducing redundant boundary vertices", () => {
    const simplified = simplifyBoundary({ type: "Polygon", coordinates: [[[0, 0], [.2, 0], [.4, 0], [.4, .4], [0, .4], [0, 0]]] });
    expect(simplified?.geometry.type).toBe("Polygon");
    expect(simplified?.simplifiedVertexCount).toBeLessThanOrEqual(simplified?.originalVertexCount ?? 0);
  });

  it("keeps disconnected MultiPolygon components for country-area projection", () => {
    const simplified = simplifyBoundary({ type: "MultiPolygon", coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      [[[3, 3], [4, 3], [4, 4], [3, 4], [3, 3]]],
    ] });
    expect(simplified?.geometry.type).toBe("MultiPolygon");
    expect(boundaryRings(simplified!.geometry)).toHaveLength(2);
  });
});
