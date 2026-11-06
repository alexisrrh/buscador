import { describe, expect, it } from "vitest";
import { selectGeographicLocation, type NominatimLocationResult } from "@/lib/geographic-location-selection";

const aCorunaPoi: NominatimLocationResult = {
  lat: "43.3690", lon: "-8.4110", category: "amenity", type: "clinic", addresstype: "clinic",
  name: "Centro de Saúde Concepción Arenal", display_name: "Centro de Saúde Concepción Arenal, A Coruña, Galicia, España",
  address: { city: "A Coruña", state: "Galicia", country: "España" },
};
const aCorunaCity: NominatimLocationResult = {
  lat: "43.3709", lon: "-8.3959", category: "boundary", type: "administrative", addresstype: "city",
  osm_type: "relation", osm_id: 12345,
  name: "La Coruña", display_name: "La Coruña, Galicia, España",
  address: { municipality: "La Coruña", state: "Galicia", country: "España" },
};

describe("geographic location selection", () => {
  it("rejects an A Coruña healthcare POI and resolves the requested municipality", () => {
    const location = selectGeographicLocation("A Coruña, La Coruña, Galicia, ESP", [aCorunaPoi, aCorunaCity]);
    expect(location.resolvedName).toBe("A Coruña");
    expect(location.locationType).toBe("city");
    expect(location.category).toBe("boundary");
    expect(location.boundaryId).toBe("relation/12345");
    expect(location.rejectedPoiCount).toBe(1);
  });

  it("resolves A Coruña and Madrid as geographic localities", () => {
    expect(selectGeographicLocation("A Coruña", [aCorunaCity]).locationType).toBe("city");
    expect(selectGeographicLocation("Madrid", [{ lat: "40.4168", lon: "-3.7038", category: "place", type: "city", addresstype: "city", name: "Madrid", address: { city: "Madrid", country: "España" } }]).resolvedName).toBe("Madrid");
  });

  it("uses only supported city/country areas and falls back for an unsupported region", () => {
    const galicia = selectGeographicLocation("Galicia", [{ lat: "42.5751", lon: "-8.1339", category: "boundary", type: "administrative", addresstype: "state", name: "Galicia", address: { state: "Galicia", country: "España" } }]);
    const espana = selectGeographicLocation("España", [{ lat: "40.2085", lon: "-3.713", category: "boundary", type: "administrative", addresstype: "country", name: "España", address: { country: "España" } }]);
    expect(galicia.resolved).toBe(false);
    expect(espana.locationType).toBe("country");
  });
});
