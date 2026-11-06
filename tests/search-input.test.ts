import { describe, expect, it } from "vitest";
import { defaultCanonicalPreferences, defaultCanonicalSearch } from "@/lib/onboarding/persistence";
import { canTransitionSearch, validateSearchInput, type SaveSearchInput } from "@/lib/server/search-input";
import type { SearchStatus } from "@/lib/types";

const id = "11111111-1111-4111-8111-111111111111";
const fresh = (): SaveSearchInput => ({ candidateProfileId: id, search: defaultCanonicalSearch("Developer"), preferences: defaultCanonicalPreferences() });
describe("search/preference input invariants", () => {
  it("accepts default drafts, interval schedules and explicit preference states", () => {
    const input = fresh(); validateSearchInput(input);
    input.search.frequencyType = "INTERVAL"; input.search.frequencyValue = { minutes: 60 }; validateSearchInput(input);
    input.search.frequencyType = "WEEKDAYS"; input.search.frequencyValue = { time: "09:00:30" };
    input.preferences.locations = [{ label: "España", country: "ES" }]; input.preferences.locationPreferenceState = "SPECIFIED";
    input.preferences.workModes = ["REMOTE"]; input.preferences.workModePreferenceState = "SPECIFIED";
    input.preferences.minimumSalary = 35000; input.preferences.currency = "EUR"; input.preferences.salaryPreferenceState = "SPECIFIED";
    input.preferences.minimumExperienceYears = 1; input.preferences.maximumExperienceYears = 5;
    validateSearchInput(input);
    input.searchId = id; input.expectedVersion = 1; validateSearchInput(input);
  });
  const invalid: Array<[string, (input: SaveSearchInput) => void]> = [
    ["candidate UUID", x=>{x.candidateProfileId="bad";}],
    ["search UUID", x=>{x.searchId="bad";}],
    ["update without version", x=>{x.searchId=id;}],
    ["create with version", x=>{x.expectedVersion=1;}],
    ["short name", x=>{x.search.name="A";}],
    ["long name", x=>{x.search.name="A".repeat(121);}],
    ["unknown schedule", x=>{Object.assign(x.search,{frequencyType:"OTHER"});}],
    ["array schedule", x=>{x.search.frequencyValue=[] as unknown as Record<string,unknown>;}],
    ["non-object schedule", x=>{Object.assign(x.search,{frequencyValue:1});}],
    ["empty interval", x=>{x.search.frequencyType="INTERVAL";x.search.frequencyValue={minutes:0};}],
    ["invalid time", x=>{x.search.frequencyValue={time:"25:00"};}],
    ["non-string time", x=>{x.search.frequencyValue={time:9};}],
    ["timezone", x=>{x.search.timezone="invalid/zone";}],
    ["empty timezone", x=>{x.search.timezone="";}],
    ["unordered scores", x=>{x.search.notificationMinScore=99;}],
    ["fractional score", x=>{x.search.semiAutoMinScore=80.5;}],
    ["negative limit", x=>{x.search.dailyApplicationLimit=-1;}],
    ["non-array list", x=>{Object.assign(x.preferences,{keywords:"React"});}],
    ["non-string list", x=>{Object.assign(x.preferences,{keywords:[1]});}],
    ["work mode", x=>{Object.assign(x.preferences,{workModes:["OTHER"]});}],
    ["location shape", x=>{Object.assign(x.preferences,{locations:[null]});}],
    ["location field", x=>{Object.assign(x.preferences,{locations:[{label:2}]});}],
    ["languages shape", x=>{Object.assign(x.preferences,{languages:[null]});}],
    ["negative salary", x=>{x.preferences.minimumSalary=-1;}],
    ["infinite salary", x=>{x.preferences.minimumSalary=Infinity;}],
    ["currency", x=>{x.preferences.currency="eur";}],
    ["fractional experience", x=>{x.preferences.minimumExperienceYears=1.5;}],
    ["experience order", x=>{x.preferences.minimumExperienceYears=6;x.preferences.maximumExperienceYears=2;}],
    ["unknown state", x=>{Object.assign(x.preferences,{locationPreferenceState:"OTHER"});}],
    ["unrestricted location with filter", x=>{x.preferences.locationPreferenceState="UNRESTRICTED";x.preferences.locations=[{label:"ES"}];}],
    ["specified location missing", x=>{x.preferences.locationPreferenceState="SPECIFIED";}],
    ["unrestricted mode with filter", x=>{x.preferences.workModePreferenceState="UNRESTRICTED";x.preferences.workModes=["REMOTE"];}],
    ["specified mode missing", x=>{x.preferences.workModePreferenceState="SPECIFIED";}],
    ["unrestricted salary with amount", x=>{x.preferences.salaryPreferenceState="UNRESTRICTED";x.preferences.minimumSalary=10;}],
    ["specified salary missing", x=>{x.preferences.salaryPreferenceState="SPECIFIED";}],
    ["specified salary zero", x=>{x.preferences.salaryPreferenceState="SPECIFIED";x.preferences.minimumSalary=0;x.preferences.currency="EUR";}],
    ["specified currency missing", x=>{x.preferences.salaryPreferenceState="SPECIFIED";x.preferences.minimumSalary=10;}],
  ];
  it.each(invalid)("rejects %s", (_,mutate) => {
    const input=fresh();mutate(input);expect(()=>validateSearchInput(input)).toThrow("INVALID_SEARCH_INPUT");
  });
  it("keeps UNKNOWN and UNRESTRICTED distinct", () => {
    const input=fresh();
    for(const state of ["UNKNOWN","UNRESTRICTED"] as const){input.preferences.locationPreferenceState=state;input.preferences.workModePreferenceState=state;input.preferences.salaryPreferenceState=state;expect(()=>validateSearchInput(input)).not.toThrow();}
  });
});

describe("search state transition matrix", () => {
  const statuses: SearchStatus[]=["DRAFT","ACTIVE","PAUSED","ARCHIVED","DISABLED"];
  const allowed=new Set(["DRAFT:ACTIVE","DRAFT:ARCHIVED","ACTIVE:PAUSED","ACTIVE:ARCHIVED","PAUSED:ACTIVE","PAUSED:ARCHIVED"]);
  it.each(statuses.flatMap(from=>statuses.map(to=>({from,to}))))("$from → $to", ({from,to})=>{
    expect(canTransitionSearch(from,to)).toBe(allowed.has(`${from}:${to}`));
  });
});
