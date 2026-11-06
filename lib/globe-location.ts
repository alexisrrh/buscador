export type GlobeLocationType = "city" | "region" | "country" | "global";

export type GlobeLocation = {
  query: string;
  resolved: boolean;
  resolvedName?: string;
  country?: string;
  region?: string;
  locationType: GlobeLocationType;
  latitude?: number;
  longitude?: number;
  candidateCount?: number;
  rejectedPoiCount?: number;
  selectedDisplayName?: string;
  category?: string;
  type?: string;
  boundaryId?: string;
};

export type GlobeBoundary = {
  available: boolean;
  source?: string;
  geometry?: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  originalVertexCount?: number;
  simplifiedVertexCount?: number;
};

export function normalizeLocationQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function isGlobalLocationQuery(value: string) {
  const normalized = normalizeLocationQuery(value).toLocaleLowerCase("es");
  return !normalized || ["cualquier ubicación", "cualquier ubicacion", "sin preferencia", "anywhere", "global", "todo el mundo"].includes(normalized);
}

export const globalGlobeLocation = (query = ""): GlobeLocation => ({ query, resolved: false, locationType: "global" });
