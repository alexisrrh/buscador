import {
  type DeterministicMatchResult,
  type MatchCandidateProfile,
  type MatchJobOffer,
  type MatchJobPreferences,
  type MatchSearchProfile,
} from "./types";
import { matchJobOfferToSearchProfile } from "./engine";

export interface SearchMatchingContext {
  candidate: MatchCandidateProfile;
  search: MatchSearchProfile;
  preferences: MatchJobPreferences;
}

export interface MatchingRepository {
  loadSearchContext(searchProfileId: string, userId: string): Promise<SearchMatchingContext>;
  loadRecentActiveOffers(options: { limit: number; seenAfter: string }): Promise<MatchJobOffer[]>;
  upsertMatch(input: {
    searchProfileId: string;
    jobOfferId: string;
    result: DeterministicMatchResult;
  }): Promise<{ created: boolean }>;
}

export interface GenerateMatchesOptions {
  limit?: number;
  recentDays?: number;
}

export interface GenerateMatchesReport {
  offersProcessed: number;
  matchesCreated: number;
  matchesUpdated: number;
  eligible: number;
  highCompatibility: number;
  review: number;
  rejected: number;
}

export async function generateMatchesForSearchProfile(
  repository: MatchingRepository,
  userId: string,
  searchProfileId: string,
  options: GenerateMatchesOptions = {},
): Promise<GenerateMatchesReport> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const recentDays = Math.min(Math.max(options.recentDays ?? 45, 1), 365);
  const seenAfter = new Date(Date.now() - recentDays * 86_400_000).toISOString();
  const context = await repository.loadSearchContext(searchProfileId, userId);
  const offers = await repository.loadRecentActiveOffers({ limit, seenAfter });

  const report: GenerateMatchesReport = {
    offersProcessed: 0,
    matchesCreated: 0,
    matchesUpdated: 0,
    eligible: 0,
    highCompatibility: 0,
    review: 0,
    rejected: 0,
  };

  for (const offer of offers) {
    const result = matchJobOfferToSearchProfile({
      offer,
      ...context,
    });
    const persisted = await repository.upsertMatch({
      searchProfileId,
      jobOfferId: offer.id,
      result,
    });

    report.offersProcessed += 1;
    report.matchesCreated += persisted.created ? 1 : 0;
    report.matchesUpdated += persisted.created ? 0 : 1;
    if (result.eligibility === "ELIGIBLE") report.eligible += 1;
    if (result.score >= context.search.notificationMinScore) report.highCompatibility += 1;
    if (result.eligibility === "REVIEW") report.review += 1;
    if (result.eligibility === "REJECTED") report.rejected += 1;
  }

  return report;
}
