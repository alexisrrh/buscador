export const BV01_POSTER_INTRINSIC = { width: 768, height: 829 } as const;
export const BV01_POSTER_ALPHA_BOUNDS = { minX: 163, maxX: 617, minY: 0, maxY: 828 } as const;

export type PixelBounds = {
  left: number; top: number; right: number; bottom: number;
  width: number; height: number; centerX: number; centerY: number;
};

export function pixelBounds(left: number, top: number, right: number, bottom: number): PixelBounds {
  return { left, top, right, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}
