import type {
  DeterministicMatchResult,
  GateResult,
  MatchCandidateProfile,
  MatchHardGates,
  MatchJobOffer,
  MatchJobPreferences,
  MatchSearchProfile,
} from "@/lib/matching/types";

export type JobRoleFamily =
  | "FRONTEND" | "FULLSTACK" | "BACKEND" | "MOBILE" | "DESIGN" | "PRODUCT"
  | "DATA" | "DEVOPS" | "SUPPORT" | "SALES" | "MARKETING" | "HR"
  | "MANAGEMENT" | "OTHER";

export type JobSeniority =
  | "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "STAFF" | "PRINCIPAL"
  | "LEAD" | "MANAGER" | "DIRECTOR" | "UNKNOWN";

type TitleCompatibility = "EXACT" | "STRONG" | "RELATED" | "WEAK" | "INCOMPATIBLE";

const TOKEN_ALIASES: Record<string, string> = {
  developer: "engineer", development: "engineer", desarrollador: "engineer",
  desarrolladora: "engineer", ingeniero: "engineer", ingeniera: "engineer",
};

const GENERIC_TITLE_TOKENS = new Set([
  "engineer", "software", "product", "manager", "specialist", "associate",
  "senior", "sr", "junior", "jr", "lead", "staff", "principal",
]);

const COUNTRY_MARKERS: Array<[string, RegExp]> = [
  ["ES", /\b(es|spain|espana|madrid|barcelona|coruna|valencia|sevilla|bilbao|malaga)\b/],
  ["US", /\b(us|usa|united states|north america)\b/],
  ["CA", /\b(canada|canadian)\b/],
  ["AU", /\b(australia|australian|apac)\b/],
  ["GB", /\b(uk|united kingdom|britain|england|london)\b/],
  ["FR", /\b(france|paris)\b/],
  ["DE", /\b(germany|deutschland|berlin)\b/],
];

export function normalizeMatchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ").trim().replace(/\s+/g, " ");
}

export function tokenizeMatchText(value: string) {
  return normalizeMatchText(value).split(" ").filter(Boolean)
    .map((token) => TOKEN_ALIASES[token] ?? token);
}

function matches(value: string, pattern: RegExp) {
  return pattern.test(normalizeMatchText(value));
}

export function classifyJobRole(title: string, normalizedTitle = normalizeMatchText(title)): JobRoleFamily {
  const value = normalizedTitle || normalizeMatchText(title);
  if (/\b(recruiter|recruiting|talent acquisition|human resources|people operations)\b/.test(value)) return "HR";
  if (/\b(account executive|sales|business development|commercial executive|revenue)\b/.test(value)) return "SALES";
  if (/\b(marketing|growth marketer|content strategist|brand manager)\b/.test(value)) return "MARKETING";
  if (/\b(customer success|customer support|technical support|product support|support specialist|implementation specialist)\b/.test(value)) return "SUPPORT";
  if (/\b(ui engineer|user interface engineer)\b/.test(value)) return "FRONTEND";
  if (/\b(design engineer|designer|ux|user experience|visual design|graphic design)\b/.test(value)) return "DESIGN";
  if (/\b(full stack|fullstack)\b/.test(value)) return "FULLSTACK";
  if (/\b(frontend|front end|react (?:engineer|developer)|web (?:engineer|developer))\b/.test(value)) return "FRONTEND";
  if (/\b(backend|back end|api (?:engineer|developer))\b/.test(value)) return "BACKEND";
  if (/\b(ios|android|mobile (?:engineer|developer)|react native)\b/.test(value)) return "MOBILE";
  if (/\b(data (?:engineer|scientist|analyst)|analytics engineer|machine learning|ml engineer)\b/.test(value)) return "DATA";
  if (/\b(devops|site reliability|sre|platform engineer|infrastructure engineer|cloud engineer)\b/.test(value)) return "DEVOPS";
  if (/\b(product manager|product owner|product management)\b/.test(value)) return "PRODUCT";
  if (/\b(engineering manager|director|head of|vp |vice president|manager)\b/.test(value)) return "MANAGEMENT";
  return "OTHER";
}

export function extractJobSeniority(title: string, explicit: string | null = null): JobSeniority {
  const value = normalizeMatchText(`${title} ${explicit ?? ""}`);
  if (/\b(intern|internship|trainee|practicas)\b/.test(value)) return "INTERN";
  if (/\b(junior|jr)\b/.test(value)) return "JUNIOR";
  if (/\b(staff)\b/.test(value)) return "STAFF";
  if (/\b(principal)\b/.test(value)) return "PRINCIPAL";
  if (/\b(lead)\b/.test(value)) return "LEAD";
  if (/\b(director|head of|vp |vice president)\b/.test(value)) return "DIRECTOR";
  if (/\b(manager)\b/.test(value)) return "MANAGER";
  if (/\b(senior|sr)\b/.test(value)) return "SENIOR";
  if (/\b(mid|intermediate)\b/.test(value)) return "MID";
  return "UNKNOWN";
}

function includesPreference(haystack: string, preference: string) {
  const normalizedPreference = normalizeMatchText(preference);
  if (!normalizedPreference) return false;
  if (haystack.includes(normalizedPreference)) return true;
  const wanted = tokenizeMatchText(preference);
  const available = new Set(tokenizeMatchText(haystack));
  return wanted.length > 0 && wanted.every((token) => available.has(token));
}

function ratioScore(matchesCount: number, total: number, weight: number, neutral: number) {
  return total === 0 ? neutral : Math.round((matchesCount / total) * weight);
}

function desiredRoleFamilies(candidate: MatchCandidateProfile, search: MatchSearchProfile, preferences: MatchJobPreferences) {
  const values = [...preferences.targetTitles, search.name, candidate.jobFamily ?? ""];
  return new Set(values.map((value) => classifyJobRole(value)).filter((family) => family !== "OTHER"));
}

function roleFamilyGate(offerFamily: JobRoleFamily, desired: Set<JobRoleFamily>, titleMatchIsStrong: boolean): GateResult {
  if (desired.size === 0) return titleMatchIsStrong ? "PASS" : "UNKNOWN";
  if (desired.has(offerFamily)) return "PASS";
  if (
    (offerFamily === "FRONTEND" && desired.has("FULLSTACK")) ||
    (offerFamily === "FULLSTACK" && desired.has("FRONTEND"))
  ) return "PASS";
  if (offerFamily === "BACKEND" && (desired.has("FRONTEND") || desired.has("FULLSTACK"))) return "UNKNOWN";
  if (offerFamily === "OTHER") return titleMatchIsStrong ? "PASS" : "UNKNOWN";
  return "FAIL";
}

function titleCompatibility(title: string, targets: string[], offerFamily: JobRoleFamily, desired: Set<JobRoleFamily>) {
  const normalized = normalizeMatchText(title);
  if (targets.some((target) => normalizeMatchText(target) === normalized)) {
    return { level: "EXACT" as TitleCompatibility, points: 35, target: targets.find((target) => normalizeMatchText(target) === normalized) };
  }

  let bestCoverage = 0;
  let bestTarget: string | undefined;
  for (const target of targets) {
    const wanted = [...new Set(tokenizeMatchText(target).filter((token) => !GENERIC_TITLE_TOKENS.has(token)))];
    const available = new Set(tokenizeMatchText(title));
    const coverage = wanted.length === 0 ? 0 : wanted.filter((token) => available.has(token)).length / wanted.length;
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      bestTarget = target;
    }
  }
  if (bestCoverage === 1) return { level: "STRONG" as TitleCompatibility, points: 33, target: bestTarget };
  if (desired.has(offerFamily)) {
    const webRelated = offerFamily === "FRONTEND" && matches(title, /\bweb (engineer|developer)\b/);
    return { level: webRelated ? "RELATED" as TitleCompatibility : "STRONG" as TitleCompatibility, points: webRelated ? 26 : 31, target: bestTarget };
  }
  if (
    (offerFamily === "FRONTEND" && desired.has("FULLSTACK")) ||
    (offerFamily === "FULLSTACK" && desired.has("FRONTEND"))
  ) return { level: "RELATED" as TitleCompatibility, points: 24, target: bestTarget };
  if (offerFamily === "OTHER") {
    return { level: "WEAK" as TitleCompatibility, points: bestCoverage > 0 ? 8 : 4, target: bestTarget };
  }
  return { level: "INCOMPATIBLE" as TitleCompatibility, points: 0, target: bestTarget };
}

function countriesFromText(value: string) {
  const normalized = normalizeMatchText(value);
  return new Set(COUNTRY_MARKERS.filter(([, pattern]) => pattern.test(normalized)).map(([code]) => code));
}

function locationGate(offer: MatchJobOffer, preferences: MatchJobPreferences): GateResult {
  if (preferences.locations.length === 0) return "PASS";
  const acceptedText = preferences.locations.flatMap((location) => [location.label, location.city, location.country]).filter(Boolean).join(" ");
  const acceptedCountries = countriesFromText(acceptedText);
  for (const location of preferences.locations) {
    if (location.country && /^[a-z]{2}$/i.test(location.country)) acceptedCountries.add(location.country.toUpperCase());
  }

  const offerText = [offer.locationText, offer.city, offer.region, offer.countryCode].filter(Boolean).join(" ");
  const normalizedOffer = normalizeMatchText(offerText);
  if (!normalizedOffer) return "UNKNOWN";
  if (/\b(worldwide|anywhere|global)\b/.test(normalizedOffer)) return "PASS";

  const offerCountries = countriesFromText(offerText);
  if (offer.countryCode) offerCountries.add(offer.countryCode.toUpperCase());
  const isEurope = /\b(eu|europe|european union|emea)\b/.test(normalizedOffer);
  if (isEurope && acceptedCountries.has("ES")) return "PASS";
  if ([...offerCountries].some((country) => acceptedCountries.has(country))) return "PASS";
  if (offerCountries.size > 0 || isEurope) return "FAIL";

  const directLocationMatch = preferences.locations.some((location) =>
    [location.label, location.city].filter((value): value is string => Boolean(value))
      .some((value) => includesPreference(normalizedOffer, value)),
  );
  if (directLocationMatch) return "PASS";
  if (offer.workMode === "REMOTE") return "UNKNOWN";
  return "FAIL";
}

function workModeGate(offer: MatchJobOffer, preferences: MatchJobPreferences): GateResult {
  if (preferences.workModes.length === 0) return "PASS";
  if (!offer.workMode || offer.workMode === "UNKNOWN") return "UNKNOWN";
  return preferences.workModes.includes(offer.workMode) ? "PASS" : "FAIL";
}

function acceptedSeniorities(candidate: MatchCandidateProfile, preferences: MatchJobPreferences) {
  const configured = preferences.acceptedSeniorities.map((value) => extractJobSeniority(value));
  if (configured.length > 0) return configured;
  const candidateLevel = extractJobSeniority(candidate.seniority ?? "");
  return candidateLevel === "UNKNOWN" ? [] : [candidateLevel];
}

function seniorityGate(offer: MatchJobOffer, candidate: MatchCandidateProfile, preferences: MatchJobPreferences): GateResult {
  const level = extractJobSeniority(offer.title, offer.seniority);
  if (level === "UNKNOWN") return "UNKNOWN";
  const accepted = acceptedSeniorities(candidate, preferences);
  if (accepted.includes(level)) return "PASS";
  if (["STAFF", "PRINCIPAL", "LEAD", "MANAGER", "DIRECTOR"].includes(level)) return "FAIL";
  const rank: Record<JobSeniority, number> = { INTERN: 0, JUNIOR: 1, MID: 2, SENIOR: 3, STAFF: 4, PRINCIPAL: 5, LEAD: 4, MANAGER: 5, DIRECTOR: 6, UNKNOWN: -1 };
  const maximumAccepted = Math.max(-1, ...accepted.map((value) => rank[value]));
  if (maximumAccepted < 0) return "UNKNOWN";
  if (rank[level] <= maximumAccepted) return "PASS";
  return level === "SENIOR" ? "UNKNOWN" : "FAIL";
}

function requiredExperience(offer: MatchJobOffer) {
  const text = normalizeMatchText(`${offer.title} ${offer.description ?? ""}`);
  const years = [...text.matchAll(/(\d{1,2})\+?\s*(?:anos|years)/g)].map((match) => Number(match[1]));
  return years.length > 0 ? Math.max(...years) : null;
}

function experienceGate(offer: MatchJobOffer, preferences: MatchJobPreferences): GateResult {
  if (preferences.maximumExperienceYears === null) return "PASS";
  const required = requiredExperience(offer);
  if (required === null) return "UNKNOWN";
  return required <= preferences.maximumExperienceYears ? "PASS" : "FAIL";
}

function roleLabel(families: Set<JobRoleFamily>) {
  return [...families].join("/") || "el perfil configurado";
}

export function matchJobOfferToSearchProfile(input: {
  offer: MatchJobOffer;
  candidate: MatchCandidateProfile;
  search: MatchSearchProfile;
  preferences: MatchJobPreferences;
}): DeterministicMatchResult {
  const { offer, candidate, search, preferences } = input;
  const haystack = normalizeMatchText(`${offer.title} ${offer.description ?? ""}`);
  const desiredFamilies = desiredRoleFamilies(candidate, search, preferences);
  const offerFamily = classifyJobRole(offer.title);
  const titleMatch = titleCompatibility(offer.title, preferences.targetTitles, offerFamily, desiredFamilies);
  const roleFamily = roleFamilyGate(offerFamily, desiredFamilies, ["EXACT", "STRONG"].includes(titleMatch.level));
  const matchedKeywords = preferences.keywords.filter((value) => includesPreference(haystack, value));
  const matchedTechnologies = preferences.requiredTechnologies.filter((value) => includesPreference(haystack, value));
  const excludedTitle = preferences.excludedTitles.some((value) => includesPreference(normalizeMatchText(offer.title), value));
  const excludedTechnologies = preferences.excludedTechnologies.filter((value) => includesPreference(haystack, value));
  const location = locationGate(offer, preferences);
  const workMode = workModeGate(offer, preferences);
  const seniority = seniorityGate(offer, candidate, preferences);
  const experience = experienceGate(offer, preferences);
  const hardGates: MatchHardGates = {
    offerActive: offer.status === "ACTIVE" ? "PASS" : "FAIL",
    searchActive: search.status === "ACTIVE" ? "PASS" : "FAIL",
    roleFamily,
    location,
    workMode,
    seniority,
    experience,
    excludedTitle: excludedTitle ? "FAIL" : "PASS",
    excludedTechnologies: excludedTechnologies.length > 0 ? "FAIL" : "PASS",
  };

  const roleCompatible = roleFamily === "PASS" && titleMatch.level !== "INCOMPATIBLE";
  const locationPoints = location === "FAIL" || workMode === "FAIL" ? 0 : location === "PASS" && workMode === "PASS" ? 15 : 7;
  const seniorityPoints = seniority === "FAIL" || experience === "FAIL" ? 0 : seniority === "PASS" && experience === "PASS" ? 10 : 5;
  const contractPoints = preferences.contractTypes.length === 0 ? 3 : offer.employmentType
    ? preferences.contractTypes.some((value) => includesPreference(normalizeMatchText(offer.employmentType ?? ""), value)) ? 3 : 0
    : 1;
  const salaryKnown = offer.salaryMin !== null || offer.salaryMax !== null;
  const comparableSalary = offer.salaryMax ?? offer.salaryMin;
  const salaryPoints = preferences.minimumSalary === null ? 2 : !salaryKnown || comparableSalary === null ? 1
    : comparableSalary >= preferences.minimumSalary && (!preferences.currency || offer.salaryCurrency === preferences.currency) ? 2 : 0;
  const components = {
    title: titleMatch.points,
    technologies: roleCompatible ? ratioScore(matchedTechnologies.length, preferences.requiredTechnologies.length, 20, 10) : 0,
    keywords: ratioScore(matchedKeywords.length, preferences.keywords.length, 15, 7),
    location: locationPoints,
    seniority: seniorityPoints,
    contract: contractPoints,
    salary: salaryPoints,
  };
  const score = Math.max(0, Math.min(100, Object.values(components).reduce((total, value) => total + value, 0)));
  const criticalFails = Object.values(hardGates).some((gate) => gate === "FAIL");
  const importantUnknown = [roleFamily, location, workMode, seniority, experience].some((gate) => gate === "UNKNOWN");
  const eligibility = criticalFails ? "REJECTED" : score >= search.notificationMinScore && !importantUnknown ? "ELIGIBLE" : "REVIEW";

  const reasons: string[] = [];
  if (roleFamily === "FAIL") reasons.push(`Rol incompatible con ${roleLabel(desiredFamilies)}`);
  else if (roleFamily === "UNKNOWN") reasons.push("Familia profesional no concluyente");
  else reasons.push(`Rol ${offerFamily} compatible`);
  if (titleMatch.target && ["EXACT", "STRONG"].includes(titleMatch.level)) reasons.push(`Coincide con ${titleMatch.target}`);
  if (location === "FAIL") reasons.push(`Ubicación incompatible: ${offer.locationText ?? offer.countryCode ?? "fuera de la zona configurada"}`);
  else if (location === "UNKNOWN") reasons.push("Alcance geográfico del remoto no especificado");
  if (seniority === "FAIL") reasons.push(`Nivel ${extractJobSeniority(offer.title, offer.seniority)} superior o incompatible`);
  else if (seniority === "UNKNOWN") reasons.push("Seniority por revisar");
  if (matchedTechnologies.length > 0 && roleCompatible) reasons.push(`Tecnologías presentes: ${matchedTechnologies.join(", ")}`);
  else if (preferences.requiredTechnologies.length > 0 && roleCompatible) reasons.push("No aparecen las tecnologías requeridas");
  if (matchedKeywords.length > 0) reasons.push(`Keywords presentes: ${matchedKeywords.join(", ")}`);
  if (!salaryKnown) reasons.push("Salario no informado");
  if (experience === "FAIL") reasons.push("Experiencia requerida superior a la configurada");
  if (excludedTitle) reasons.push("El título está excluido por la búsqueda");
  if (excludedTechnologies.length > 0) reasons.push(`Tecnologías excluidas: ${excludedTechnologies.join(", ")}`);

  return { scoringVersion: "deterministic-v2", score, eligibility, components, hardGates, reasons };
}
