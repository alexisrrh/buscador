import { describe, expect, it } from "vitest";
import { AUTO_ROTATE_RESUME_DELAY_MS, MAX_GLOBE_PITCH, canAutoRotate, clampGlobePitch, geoToGlobeLocal } from "@/components/bv-01-hologram-globe";

describe("BV-01 hologram globe interaction", () => {
  it("limits manual pitch without limiting yaw", () => {
    expect(clampGlobePitch(MAX_GLOBE_PITCH * 2)).toBe(MAX_GLOBE_PITCH);
    expect(clampGlobePitch(-MAX_GLOBE_PITCH * 2)).toBe(-MAX_GLOBE_PITCH);
    expect(clampGlobePitch(.2)).toBe(.2);
  });

  it("keeps auto-rotation disabled for reduced motion, dragging, and the resume delay", () => {
    expect(canAutoRotate(true, false, AUTO_ROTATE_RESUME_DELAY_MS + 1, 0)).toBe(false);
    expect(canAutoRotate(false, true, AUTO_ROTATE_RESUME_DELAY_MS + 1, 0)).toBe(false);
    expect(canAutoRotate(false, false, AUTO_ROTATE_RESUME_DELAY_MS - 1, AUTO_ROTATE_RESUME_DELAY_MS)).toBe(false);
    expect(canAutoRotate(false, false, AUTO_ROTATE_RESUME_DELAY_MS, AUTO_ROTATE_RESUME_DELAY_MS)).toBe(true);
  });

  it("uses one texture-aligned geographic axis for steering and surface geometry", () => {
    const coruna = geoToGlobeLocal(43.36, -8.41).normalize();
    const london = geoToGlobeLocal(51.51, -.13).normalize();
    const tokyo = geoToGlobeLocal(35.68, 139.69).normalize();
    expect(coruna.y).toBeGreaterThan(0);
    expect(london.y).toBeGreaterThan(0);
    expect(coruna.dot(london)).toBeGreaterThan(.9);
    expect(coruna.dot(tokyo)).toBeLessThan(0);
  });
});
