import type {
  DeterministicMatchResult,
  GateResult,
  MatchCandidateProfile,
  MatchHardGates,
  MatchJobOffer,
  MatchJobPreferences,
  MatchSearchProfile,
} from "@/lib/matching/types";

const SENIORITY_RANKS: Record<string, number> = {
  intern: 0,
  internship: 0,
  trainee: 0,
  junior: 1,
  jr: 1,
  mid: 2,
  intermediate: 2,
  senior: 3,
  sr: 3,
  lead: 4,
  manager: 5,
  director: 6,
};

const TOKEN_ALIASES: Record<string, string> = {
  developer: "engineer",
  development: "engineer",
  desarrollador: "engineer",
  desarrolladora: "engineer",
  ingeniero: "engineer",
  ingeniera: "engineer",
};

export function normalizeMatchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeMatchText(value: string) {
  return normalizeMatchText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => TOKEN_ALIASES[token] ?? token);
}

function includesPreference(haystack: string, preference: string) {
  const normalizedPreference = normalizeMatchText(preference);
  if (!normalizedPreference) return false;
  if (haystack.includes(normalizedPreference)) return true;
  const wanted = tokenizeMatchText(preference);
  const available = new Set(tokenizeMatchText(haystack));
  return wanted.length > 0 && wanted.every((token) => available.has(token));
}

function ratioScore(matches: number, total: number, weight: number, neutral: number) {
  if (total === 0) return neutral;
  return Math.round((matches / total) * weight);
}

function titleScore(title: string, targets: string[]) {
  if (targets.length === 0) return 12;
  const offerTokens = new Set(tokenizeMatchText(title));
  let best = 0;
  for (const target of targets) {
    const targetTokens = new Set(tokenizeMatchText(target));
    if (targetTokens.size === 0) continue;
    const overlap = [...targetTokens].filter((token) => offerTokens.has(token)).length;
    const coverage = overlap / targetTokens.size;
    const precision = overlap / Math.max(offerTokens.size, 1);
    best = Math.max(best, coverage * 0.75 + precision * 0.25);
  }
  return Math.round(best * 25);
}

function locationGate(offer: MatchJobOffer, preferences: MatchJobPreferences): GateResult {
  if (preferences.locations.length === 0) return "PASS";
  if (offer.workMode === "REMOTE" && preferences.workModes.includes("REMOTE")) {
    return "PASS";
  }
  const offerLocation = normalizeMatchText(
    [offer.locationText, offer.city, offer.region, offer.countryCode]
      .filter(Boolean)
      .join(" "),
  );
  if (!offerLocation) return "UNKNOWN";
  return preferences.locations.some((location) =>
    [location.label, location.city, location.country]
      .filter((value): value is string => Boolean(value))
      .some((value) => includesPreference(offerLocation, value)),
  )
    ? "PASS"
    : "FAIL";
}

function workModeGate(offer: MatchJobOffer, preferences: MatchJobPreferences): GateResult {
  if (preferences.workModes.length === 0) return "PASS";
  if (!offer.workMode || offer.workMode === "UNKNOWN") return "UNKNOWN";
  return preferences.workModes.includes(offer.workMode) ? "PASS" : "FAIL";
}

function seniorityValue(value: string | null) {
  if (!value) return null;
  const normalized = normalizeMatchText(value);
  for (const [label, rank] of Object.entries(SENIORITY_RANKS)) {
    if (normalized.split(" ").includes(label)) return rank;
  }
  return null;
}

function seniorityGate(
  offer: MatchJobOffer,
  candidate: MatchCandidateProfile,
  preferences: MatchJobPreferences,
): GateResult {
  if (!offer.seniority) return "UNKNOWN";
  if (
    preferences.acceptedSeniorities.some((value) =>
      includesPreference(normalizeMatchText(offer.seniority ?? ""), value),
    )
  ) {
    return "PASS";
  }
  const offerRank = seniorityValue(offer.seniority);
  const acceptedRanks = preferences.acceptedSeniorities
    .map((value) => seniorityValue(value))
    .filter((value): value is number => value !== null);
  const candidateRank = seniorityValue(candidate.seniority);
  if (acceptedRanks.length > 0 && offerRank !== null) {
    return acceptedRanks.includes(offerRank) ? "PASS" : "FAIL";
  }
  if (candidateRank !== null && offerRank !== null) {
    return offerRank <= candidateRank + 1 ? "PASS" : "FAIL";
  }
  return "UNKNOWN";
}

function requiredExperience(offer: MatchJobOffer) {
  const text = normalizeMatchText(`${offer.title} ${offer.description ?? ""}`);
  const years = [...text.matchAll(/(\d{1,2})\+?\s*(?:anos|years)/g)].map((match) =>
    Number(match[1]),
  );
  return years.length > 0 ? Math.max(...years) : null;
}

function experienceGate(offer: MatchJobOffer, preferences: MatchJobPreferences): GateResult {
  if (preferences.maximumExperienceYears === null) return "PASS";
  const required = requiredExperience(offer);
  if (required === null) return "UNKNOWN";
  return required <= preferences.maximumExperienceYears ? "PASS" : "FAIL";
}

function gateReason(label: string, gate: GateResult) {
  if (gate === "FAIL") return `${label}: incompatible`;
  if (gate === "UNKNOWN") return `${label}: información insuficiente`;
  return null;
}

export function matchJobOfferToSearchProfile(input: {
  offer: MatchJobOffer;
  candidate: MatchCandidateProfile;
  search: MatchSearchProfile;
  preferences: MatchJobPreferences;
}): DeterministicMatchResult {
  const { offer, candidate, search, preferences } = input;
  const haystack = normalizeMatchText(`${offer.title} ${offer.description ?? ""}`);
  const matchedKeywords = preferences.keywords.filter((value) =>
    includesPreference(haystack, value),
  );
  const matchedTechnologies = preferences.requiredTechnologies.filter((value) =>
    includesPreference(haystack, value),
  );
  const excludedTitle = preferences.excludedTitles.some((value) =>
    includesPreference(normalizeMatchText(offer.title), value),
  );
  const excludedTechnologies = preferences.excludedTechnologies.filter((value) =>
    includesPreference(haystack, value),
  );
  const location = locationGate(offer, preferences);
  const workMode = workModeGate(offer, preferences);
  const seniority = seniorityGate(offer, candidate, preferences);
  const experience = experienceGate(offer, preferences);
  const hardGates: MatchHardGates = {
    offerActive: offer.status === "ACTIVE" ? "PASS" : "FAIL",
    searchActive: search.status === "ACTIVE" ? "PASS" : "FAIL",
    location,
    workMode,
    seniority,
    experience,
    excludedTitle: excludedTitle ? "FAIL" : "PASS",
    excludedTechnologies: excludedTechnologies.length > 0 ? "FAIL" : "PASS",
  };

  const locationPoints =
    location === "FAIL" || workMode === "FAIL"
      ? 0
      : location === "PASS" && workMode === "PASS"
        ? 15
        : 8;
  const seniorityPoints =
    seniority === "FAIL" || experience === "FAIL"
      ? 0
      : seniority === "PASS" && experience === "PASS"
        ? 10
        : 5;
  const contractMatch =
    preferences.contractTypes.length === 0
      ? 5
      : offer.employmentType
        ? preferences.contractTypes.some((value) =>
            includesPreference(normalizeMatchText(offer.employmentType ?? ""), value),
          )
          ? 5
          : 0
        : 2;
  const salaryKnown = offer.salaryMin !== null || offer.salaryMax !== null;
  const comparableSalary = offer.salaryMax ?? offer.salaryMin;
  const salaryPoints =
    preferences.minimumSalary === null
      ? 5
      : !salaryKnown || comparableSalary === null
        ? 3
        : comparableSalary >= preferences.minimumSalary &&
            (!preferences.currency || offer.salaryCurrency === preferences.currency)
          ? 5
          : 0;
  const components = {
    title: titleScore(offer.title, preferences.targetTitles),
    keywords: ratioScore(matchedKeywords.length, preferences.keywords.length, 20, 10),
    technologies: ratioScore(
      matchedTechnologies.length,
      preferences.requiredTechnologies.length,
      20,
      10,
    ),
    location: locationPoints,
    seniority: seniorityPoints,
    contract: contractMatch,
    salary: salaryPoints,
  };
  const score = Math.max(
    0,
    Math.min(100, Object.values(components).reduce((total, value) => total + value, 0)),
  );
  const criticalFails = Object.values(hardGates).some((gate) => gate === "FAIL");
  const unknowns = Object.values(hardGates).some((gate) => gate === "UNKNOWN");
  const eligibility = criticalFails
    ? "REJECTED"
    : score >= search.notificationMinScore && !unknowns
      ? "ELIGIBLE"
      : "REVIEW";

  const reasons: string[] = [];
  const bestTarget = preferences.targetTitles.find((target) =>
    includesPreference(normalizeMatchText(offer.title), target),
  );
  if (bestTarget) reasons.push(`Coincide con ${bestTarget}`);
  if (matchedKeywords.length > 0) {
    reasons.push(`Keywords presentes: ${matchedKeywords.join(", ")}`);
  }
  if (matchedTechnologies.length > 0) {
    reasons.push(`Tecnologías presentes: ${matchedTechnologies.join(", ")}`);
  } else if (preferences.requiredTechnologies.length > 0) {
    reasons.push("No aparecen las tecnologías requeridas");
  }
  if (offer.workMode === "REMOTE" && workMode === "PASS") {
    reasons.push("Compatible con trabajo remoto");
  }
  if (!salaryKnown) reasons.push("Salario no informado");
  for (const [label, gate] of [
    ["Ubicación", location],
    ["Modalidad", workMode],
    ["Seniority", seniority],
    ["Experiencia", experience],
  ] as const) {
    const reason = gateReason(label, gate);
    if (reason) reasons.push(reason);
  }
  if (excludedTitle) reasons.push("El título está excluido por la búsqueda");
  if (excludedTechnologies.length > 0) {
    reasons.push(`Tecnologías excluidas: ${excludedTechnologies.join(", ")}`);
  }
  if (reasons.length === 0) reasons.push("Compatibilidad calculada con criterios disponibles");

  return {
    scoringVersion: "deterministic-v1",
    score,
    eligibility,
    components,
    hardGates,
    reasons,
  };
}
