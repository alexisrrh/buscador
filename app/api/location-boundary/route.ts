import { NextResponse } from "next/server";
import { simplifyBoundary, type BoundaryGeometry } from "@/lib/geographic-boundary";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const MAX_CACHE_ENTRIES = 80;
const cache = new Map<string, { expiresAt: number; value: object }>();

type NominatimLookupResult = { geojson?: BoundaryGeometry };

function boundaryOsmId(value: string | null) {
  const match = value?.match(/^(relation|way)\/(\d+)$/i);
  return match ? `${match[1].toLowerCase() === "relation" ? "R" : "W"}${match[2]}` : undefined;
}

export async function GET(request: Request) {
  const boundaryId = new URL(request.url).searchParams.get("id");
  const osmId = boundaryOsmId(boundaryId);
  if (!osmId) return NextResponse.json({ available: false }, { status: 400 });
  const cached = cache.get(osmId);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/lookup");
    url.search = new URLSearchParams({ osm_ids: osmId, format: "jsonv2", polygon_geojson: "1" }).toString();
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "BuscaVacante boundary visualisation/1.0" }, signal: controller.signal, next: { revalidate: 86_400 } });
    const [result] = response.ok ? await response.json() as NominatimLookupResult[] : [];
    const geometry = result?.geojson;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return NextResponse.json({ available: false });
    const simplified = simplifyBoundary(geometry);
    if (!simplified) return NextResponse.json({ available: false });
    const value = { available: true, source: "OpenStreetMap Nominatim lookup", ...simplified };
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? osmId);
    cache.set(osmId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return NextResponse.json(value);
  } catch {
    return NextResponse.json({ available: false });
  } finally {
    clearTimeout(timeout);
  }
}
