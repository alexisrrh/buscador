import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createApplicationServiceClient } from "@/lib/applications/repository.server";
import { connectorForSource } from "./connectors";
import { determineApplicationMode } from "./decision";
import type { ApplicationDecision, ApplicationQuestion } from "./types";

export class ApplicationEngineError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export async function prepareSubmission(input: {
  authClient: SupabaseClient;
  userId: string;
  applicationDraftId: string;
  serviceClient?: SupabaseClient;
}) {
  const { data: draft, error: draftError } = await input.authClient.from("application_drafts")
    .select("id,user_id,candidate_profile_id,search_profile_id,job_offer_id,source_resume_id,status,match_summary")
    .eq("id", input.applicationDraftId).eq("user_id", input.userId).maybeSingle();
  if (draftError || !draft) throw new ApplicationEngineError("DRAFT_NOT_FOUND", "Borrador no encontrado.");

  const [{ data: offer }, { data: resume }, { data: search }, { data: settings }, { data: sources }, { count: todayCount }] = await Promise.all([
    input.authClient.from("job_offers").select("id,status,canonical_url").eq("id", draft.job_offer_id).maybeSingle(),
    input.authClient.from("resumes").select("id,status").eq("id", draft.source_resume_id).eq("user_id", input.userId).maybeSingle(),
    input.authClient.from("search_profiles").select("id,application_mode,auto_apply_min_score,daily_application_limit").eq("id", draft.search_profile_id).eq("user_id", input.userId).maybeSingle(),
    input.authClient.from("application_user_settings").select("auto_apply_enabled").eq("user_id", input.userId).maybeSingle(),
    input.authClient.from("job_offer_sources").select("id,source_url,company_career_source_id,job_sources(code,auto_apply_enabled)").eq("job_offer_id", draft.job_offer_id),
    input.authClient.from("applications").select("id", { count: "exact", head: true }).eq("user_id", input.userId).gte("last_attempt_at", startOfUtcDay()),
  ]);
  if (!offer || !resume || !search) throw new ApplicationEngineError("APPLICATION_DATA_MISSING", "Faltan datos para preparar la postulación.");
  const source = selectSource(sources ?? []);
  const sourceInfo = relationSource(source?.job_sources);
  const sourceCode = sourceInfo?.code ?? null;
  const connector = connectorForSource(sourceCode);
  const inspection = await connector.inspectApplication(source?.source_url ?? offer.canonical_url ?? "");
  const matchSummary = draft.match_summary as {
    score?: number;
    eligibility?: string;
    gaps?: { missing_requirements?: string[] };
  };
  const questions = await resolveQuestions(input.authClient, input.userId, inspection.questions);
  const decision = determineApplicationMode({
    draftStatus: draft.status,
    resumeStatus: resume.status,
    offerStatus: offer.status,
    eligibility: matchSummary.eligibility ?? "REJECTED",
    score: matchSummary.score ?? 0,
    minimumScore: search.auto_apply_min_score,
    searchApplicationMode: search.application_mode,
    userAutoApplyEnabled: settings?.auto_apply_enabled ?? false,
    sourceAutoApplyEnabled: sourceInfo?.auto_apply_enabled ?? false,
    connector: connector.supports(sourceCode ?? "") ? connector.capabilities : null,
    hardRequirementsMissing: matchSummary.gaps?.missing_requirements ?? [],
    duplicateExists: false,
    dailyLimit: search.daily_application_limit,
    applicationsToday: todayCount ?? 0,
    ...inspection,
    questions,
  });
  const targetUrl = source?.source_url ?? offer.canonical_url;
  if (!targetUrl) throw new ApplicationEngineError("TARGET_URL_MISSING", "La oferta no tiene una URL de candidatura.");
  const serviceClient = input.serviceClient ?? createApplicationServiceClient();
  const { data, error } = await serviceClient.rpc("create_prepared_application", {
    p_user_id: input.userId,
    p_application_draft_id: draft.id,
    p_job_offer_source_id: source?.id ?? null,
    p_apply_mode: decision.mode,
    p_target_url: targetUrl,
    p_status: decision.blocked ? "BLOCKED" : "PREPARED",
    p_decision_reasons: decision.reasons,
    p_safety_checklist: decision.checklist,
    p_failure_code: decision.blocked ? decision.reasons[0] ?? "SAFETY_GATE_FAILED" : null,
    p_failure_message_public: decision.blocked ? publicBlockedMessage(decision) : null,
    p_answers: questions.map(toDatabaseQuestion),
  });
  if (error || !data) throw new ApplicationEngineError("APPLICATION_CREATE_FAILED", "No se pudo preparar la postulación.");
  const result = data as { id: string; created: boolean };
  return { ...result, decision, sourceCode };
}

async function resolveQuestions(client: SupabaseClient, userId: string, questions: ApplicationQuestion[]) {
  if (!questions.length) return [];
  const keys = questions.map((question) => question.questionKey);
  const { data } = await client.from("user_application_answers").select("question_key,answer_value,answer_type,classification")
    .eq("user_id", userId).in("question_key", keys);
  const approved = new Map((data ?? []).map((answer) => [answer.question_key, answer]));
  return questions.map((question) => {
    const saved = approved.get(question.questionKey);
    return saved ? { ...question, answerValue: saved.answer_value, answerType: saved.answer_type, classification: saved.classification, source: "USER_APPROVED" as const, confidence: 1, requiresConfirmation: false } : question;
  });
}

function selectSource<T extends { company_career_source_id: string | null }>(sources: T[]) {
  return sources.find((source) => source.company_career_source_id) ?? sources[0] ?? null;
}

function relationSource(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "code" in relation
    ? {
      code: String(relation.code),
      auto_apply_enabled: "auto_apply_enabled" in relation && relation.auto_apply_enabled === true,
    }
    : null;
}

function toDatabaseQuestion(question: ApplicationQuestion) {
  return {
    question_key: question.questionKey,
    question_text: question.questionText,
    answer_type: question.answerType,
    answer_value: question.answerValue,
    source: question.source,
    confidence: question.confidence,
    requires_confirmation: question.requiresConfirmation,
    classification: question.classification,
  };
}

function publicBlockedMessage(decision: ApplicationDecision) {
  if (decision.reasons.includes("DAILY_LIMIT_REACHED")) return "Se alcanzó el límite diario de candidaturas.";
  if (decision.reasons.includes("APPLICATION_DRAFT_NOT_APPROVED")) return "Debes aprobar el borrador antes de preparar la postulación.";
  return "La postulación está bloqueada por una comprobación de seguridad.";
}

function startOfUtcDay() {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  return value.toISOString();
}
