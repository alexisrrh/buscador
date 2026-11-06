import { globalGlobeLocation, type GlobeLocation, type GlobeLocationType } from "@/lib/globe-location";

export type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
};

export type NominatimLocationResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  addresstype?: string;
  type?: string;
  category?: string;
  class?: string;
  osm_type?: string;
  osm_id?: number;
  name?: string;
  address?: NominatimAddress;
};

const POI_CATEGORIES = new Set(["amenity", "healthcare", "shop", "tourism", "office", "building", "leisure", "restaurant", "highway"]);
const POI_TYPES = new Set(["hospital", "clinic", "doctors", "pharmacy", "school", "restaurant", "cafe", "hotel", "attraction", "museum", "supermarket", "building"]);
const CITY_TYPES = new Set(["city", "town", "village", "municipality", "hamlet", "locality"]);

function normalized(value?: string) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

export function requestedPlaceLabel(query: string) { return query.split(",")[0]?.trim() ?? query; }
function canonicalPlace(value?: string) { return normalized(value).replace(/^(a|la|el|las|los)\s+/, ""); }
function firstRequestedPlace(query: string) { return canonicalPlace(requestedPlaceLabel(query)); }

function resultCategory(result: NominatimLocationResult) { return (result.category ?? result.class ?? "").toLocaleLowerCase("en"); }
function resultType(result: NominatimLocationResult) { return (result.addresstype ?? result.type ?? "").toLocaleLowerCase("en"); }

function isPoi(result: NominatimLocationResult) {
  return POI_CATEGORIES.has(resultCategory(result)) || POI_TYPES.has(resultType(result));
}

function getLocationType(result: NominatimLocationResult): GlobeLocationType | undefined {
  const address = result.address;
  const type = resultType(result);
  if (type === "country" || result.type?.toLocaleLowerCase("en") === "country") return "country";
  if (CITY_TYPES.has(type) || address?.city || address?.town || address?.village || address?.municipality) return "city";
  return undefined;
}

function resolvedName(result: NominatimLocationResult, locationType: GlobeLocationType) {
  const address = result.address;
  if (locationType === "city") return address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? result.name;
  if (locationType === "country") return address?.country ?? result.name;
  return address?.state ?? address?.region ?? address?.county ?? result.name;
}

function candidateScore(query: string, result: NominatimLocationResult, locationType: GlobeLocationType) {
  const requestedPlace = firstRequestedPlace(query);
  const candidateName = canonicalPlace(resolvedName(result, locationType));
  const directName = canonicalPlace(result.name);
  const queryWords = canonicalPlace(query).split(" ").filter(Boolean);
  const semanticScore = locationType === "city" ? 300 : locationType === "region" ? 180 : 130;
  const exactPlaceMatch = candidateName === requestedPlace || directName === requestedPlace ? 500 : 0;
  const partialPlaceMatch = requestedPlace && (candidateName.includes(requestedPlace) || directName.includes(requestedPlace)) ? 160 : 0;
  const queryCoverage = queryWords.reduce((score, word) => score + (candidateName.includes(word) || directName.includes(word) ? 7 : 0), 0);
  const geographicCategory = ["place", "boundary"].includes(resultCategory(result)) ? 45 : 0;
  return semanticScore + exactPlaceMatch + partialPlaceMatch + queryCoverage + geographicCategory;
}

export function selectGeographicLocation(query: string, candidates: NominatimLocationResult[]): GlobeLocation {
  let rejectedPoiCount = 0;
  const valid = candidates.flatMap((candidate) => {
    if (isPoi(candidate)) {
      rejectedPoiCount += 1;
      return [];
    }
    // Search locations are area entities only. A valid locality/country must
    // come from Nominatim's geographic place or administrative boundary data.
    if (!["place", "boundary"].includes(resultCategory(candidate))) return [];
    const locationType = getLocationType(candidate);
    const latitude = Number(candidate.lat);
    const longitude = Number(candidate.lon);
    const name = locationType ? resolvedName(candidate, locationType) : undefined;
    if (!locationType || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    return [{ candidate, locationType, latitude, longitude, name, score: candidateScore(query, candidate, locationType) }];
  });
  const selected = valid.sort((left, right) => right.score - left.score)[0];
  if (!selected) return { ...globalGlobeLocation(query), candidateCount: candidates.length, rejectedPoiCount };
  const address = selected.candidate.address;
  const requestedName = requestedPlaceLabel(query);
  const useRequestedCityLabel = selected.locationType === "city" && canonicalPlace(selected.name) === canonicalPlace(requestedName);
  return {
    query,
    resolved: true,
    resolvedName: useRequestedCityLabel ? requestedName : selected.name,
    country: address?.country,
    region: address?.state ?? address?.region ?? address?.county,
    locationType: selected.locationType,
    latitude: selected.latitude,
    longitude: selected.longitude,
    candidateCount: candidates.length,
    rejectedPoiCount,
    selectedDisplayName: selected.candidate.display_name,
    category: resultCategory(selected.candidate),
    type: resultType(selected.candidate),
    boundaryId: selected.candidate.osm_type && selected.candidate.osm_id ? `${selected.candidate.osm_type}/${selected.candidate.osm_id}` : undefined,
  };
}
