import { NextResponse } from "next/server";
import { globalGlobeLocation, isGlobalLocationQuery, normalizeLocationQuery, type GlobeLocation } from "@/lib/globe-location";
import { requestedPlaceLabel, selectGeographicLocation, type NominatimLocationResult } from "@/lib/geographic-location-selection";

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map<string, { expiresAt: number; value: GlobeLocation }>();

async function searchNominatim(query: string, signal: AbortSignal) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", limit: "12", "accept-language": "es,en" }).toString();
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "BuscaVacante location visualisation/1.0" }, signal, next: { revalidate: 43_200 } });
  return response.ok ? await response.json() as NominatimLocationResult[] : [];
}

export async function GET(request: Request) {
  const query = normalizeLocationQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (isGlobalLocationQuery(query)) return NextResponse.json(globalGlobeLocation(query));
  const cacheKey = query.toLocaleLowerCase("es");
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const results = await searchNominatim(query, controller.signal);
    // Some verbose locality strings are indexed primarily against a facility.
    // Retry the same user-selected locality, never a nearby POI or guessed place.
    const primaryPlace = requestedPlaceLabel(query);
    const primaryResults = !selectGeographicLocation(query, results).resolved && primaryPlace !== query
      ? await searchNominatim(primaryPlace, controller.signal)
      : [];
    const value = selectGeographicLocation(query, [...results, ...primaryResults]);
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? cacheKey);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return NextResponse.json(value);
  } catch {
    return NextResponse.json(globalGlobeLocation(query));
  } finally {
    clearTimeout(timeout);
  }
}
