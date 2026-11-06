export type BoundaryGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export type SimplifiedBoundary = {
  geometry: BoundaryGeometry;
  originalVertexCount: number;
  simplifiedVertexCount: number;
};

type Coordinate = [number, number];

function squaredDistanceToSegment(point: Coordinate, start: Coordinate, end: Coordinate) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  const x = start[0] + t * dx;
  const y = start[1] + t * dy;
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}

function simplifyOpen(points: Coordinate[], toleranceSquared: number): Coordinate[] {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let index = 0;
  for (let pointIndex = 1; pointIndex < points.length - 1; pointIndex += 1) {
    const distance = squaredDistanceToSegment(points[pointIndex], points[0], points[points.length - 1]);
    if (distance > maxDistance) { index = pointIndex; maxDistance = distance; }
  }
  if (maxDistance <= toleranceSquared) return [points[0], points[points.length - 1]];
  return [...simplifyOpen(points.slice(0, index + 1), toleranceSquared).slice(0, -1), ...simplifyOpen(points.slice(index), toleranceSquared)];
}

function simplifyRing(ring: number[][], tolerance: number) {
  const coordinates = ring.filter((point): point is Coordinate => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])).map(([longitude, latitude]) => [longitude, latitude]);
  if (coordinates.length < 4) return [];
  const closed = coordinates[0][0] === coordinates.at(-1)![0] && coordinates[0][1] === coordinates.at(-1)![1];
  const open = closed ? coordinates.slice(0, -1) : coordinates;
  const simplified = simplifyOpen(open as Coordinate[], tolerance ** 2);
  const safe = simplified.length >= 3 ? simplified : open;
  return [...safe, safe[0]];
}

function ringsFromGeometry(geometry: BoundaryGeometry): number[][][] {
  return geometry.type === "Polygon" ? geometry.coordinates as number[][][] : (geometry.coordinates as number[][][][]).flat();
}

export function simplifyBoundary(geometry: BoundaryGeometry): SimplifiedBoundary | undefined {
  const rings = ringsFromGeometry(geometry);
  const vertices = rings.flat();
  if (!vertices.length) return undefined;
  const longitudes = vertices.map(([longitude]) => longitude);
  const latitudes = vertices.map(([, latitude]) => latitude);
  const extent = Math.max(Math.max(...longitudes) - Math.min(...longitudes), Math.max(...latitudes) - Math.min(...latitudes));
  const tolerance = Math.max(.00001, extent * .00035);
  const simplifyPolygon = (polygon: number[][][]) => polygon.map((ring) => simplifyRing(ring, tolerance)).filter((ring) => ring.length >= 4);
  const simplifiedCoordinates = geometry.type === "Polygon"
    ? simplifyPolygon(geometry.coordinates as number[][][])
    : (geometry.coordinates as number[][][][]).map(simplifyPolygon).filter((polygon) => polygon.length);
  const simplified = { type: geometry.type, coordinates: simplifiedCoordinates } as BoundaryGeometry;
  return { geometry: simplified, originalVertexCount: vertices.length, simplifiedVertexCount: ringsFromGeometry(simplified).flat().length };
}

export function boundaryRings(geometry: BoundaryGeometry) { return ringsFromGeometry(geometry); }
