import type { ApplicationDecision, ApplicationDecisionInput, ApplicationQuestion } from "./types";

export function determineApplicationMode(input: ApplicationDecisionInput): ApplicationDecision {
  const checklist: ApplicationDecision["checklist"] = {
    draft: input.draftStatus === "APPROVED" ? "PASS" : "FAIL",
    resume: input.resumeStatus === "APPROVED" ? "PASS" : "FAIL",
    offer: input.offerStatus === "ACTIVE" ? "PASS" : "FAIL",
    score: input.score >= input.minimumScore ? "PASS" : "FAIL",
    requirements: input.hardRequirementsMissing.length ? "FAIL" : "PASS",
    answers: questionsComplete(input.questions) ? "PASS" : "UNKNOWN",
    source: input.connector ? "PASS" : "FAIL",
    daily_limit: input.dailyLimit <= 0 ? "UNKNOWN" : input.applicationsToday < input.dailyLimit ? "PASS" : "FAIL",
  };
  const blockedReasons: string[] = [];
  if (checklist.draft === "FAIL") blockedReasons.push("APPLICATION_DRAFT_NOT_APPROVED");
  if (checklist.resume === "FAIL") blockedReasons.push("APPROVED_RESUME_REQUIRED");
  if (checklist.offer === "FAIL") blockedReasons.push("JOB_OFFER_NOT_ACTIVE");
  if (input.eligibility === "REJECTED") blockedReasons.push("JOB_MATCH_REJECTED");
  if (input.duplicateExists) blockedReasons.push("DUPLICATE_APPLICATION");
  if (input.dailyLimit > 0 && input.applicationsToday >= input.dailyLimit) blockedReasons.push("DAILY_LIMIT_REACHED");
  if (blockedReasons.length) return { mode: "MANUAL", blocked: true, reasons: blockedReasons, confirmations: [], checklist };

  const manualReasons: string[] = [];
  if (!input.connector?.supportsDirectApply) manualReasons.push("SOURCE_CONNECTOR_NOT_SUPPORTED");
  if (input.hasCaptcha) manualReasons.push("CAPTCHA_REQUIRED");
  if (input.hasAssessment) manualReasons.push("ASSESSMENT_REQUIRED");
  if (input.hasComplexAuthentication || input.connector?.requiresAuthentication) manualReasons.push("COMPLEX_AUTHENTICATION_REQUIRED");
  if (input.hasUnsupportedDynamicForm) manualReasons.push("UNSUPPORTED_DYNAMIC_FORM");
  if (input.questions.some((question) => question.classification === "UNSUPPORTED")) manualReasons.push("UNSUPPORTED_QUESTION");
  if (input.searchApplicationMode === "MANUAL") manualReasons.push("SEARCH_POLICY_MANUAL");
  if (manualReasons.length) return { mode: "MANUAL", blocked: false, reasons: manualReasons, confirmations: [], checklist };

  const confirmations = input.questions
    .filter(needsConfirmation)
    .map((question) => question.questionText);
  if (input.hasUnexpectedConsent) confirmations.push("Nuevo consentimiento requerido");
  if (input.hardRequirementsMissing.length) confirmations.push(...input.hardRequirementsMissing.map((requirement) => `Requisito no acreditado: ${requirement}`));
  if (input.eligibility === "REVIEW") confirmations.push("Confirmar compatibilidad de la oferta");
  if (checklist.score === "FAIL") confirmations.push("Confirmar candidatura por debajo del score automático");
  if (input.searchApplicationMode === "REVIEW") confirmations.push("La política de la búsqueda requiere revisión");
  if (confirmations.length) {
    return { mode: "REVIEW", blocked: false, reasons: ["USER_CONFIRMATION_REQUIRED"], confirmations, checklist };
  }

  const autoSafe = input.searchApplicationMode === "AUTO" && input.userAutoApplyEnabled &&
    input.sourceAutoApplyEnabled &&
    input.connector?.supportsAutoSubmit && input.connector.supportsResumeUpload &&
    checklist.daily_limit === "PASS" && checklist.requirements === "PASS" && checklist.score === "PASS" &&
    input.eligibility === "ELIGIBLE" && input.questions.every(isAutoSafeQuestion);
  if (!autoSafe) {
    const reasons = [
      !input.userAutoApplyEnabled ? "USER_AUTO_APPLY_DISABLED" : null,
      !input.sourceAutoApplyEnabled ? "SOURCE_AUTO_APPLY_DISABLED" : null,
      !input.connector?.supportsAutoSubmit ? "CONNECTOR_AUTO_SUBMIT_UNAVAILABLE" : null,
      "AUTO_SAFETY_REQUIREMENTS_NOT_MET",
    ].filter((reason): reason is string => Boolean(reason));
    return { mode: "REVIEW", blocked: false, reasons, confirmations: ["Confirmar la candidatura antes de postular"], checklist };
  }
  return { mode: "AUTO", blocked: false, reasons: ["ALL_AUTO_SAFETY_GATES_PASSED"], confirmations: [], checklist };
}

function questionsComplete(questions: ApplicationQuestion[]) {
  return questions.every((question) => question.answerValue !== null && question.answerType !== "UNKNOWN");
}

function needsConfirmation(question: ApplicationQuestion) {
  if (question.answerValue === null || question.requiresConfirmation) return true;
  if (question.classification === "LEGAL_SENSITIVE") return question.source !== "USER_APPROVED";
  return question.classification === "USER_CONFIRMATION" || question.classification === "OPEN_TEXT";
}

function isAutoSafeQuestion(question: ApplicationQuestion) {
  if (question.answerValue === null || question.requiresConfirmation) return false;
  if (question.classification === "LEGAL_SENSITIVE") return question.source === "USER_APPROVED";
  return question.classification === "SAFE_STRUCTURED" &&
    ["PROFILE", "SEARCH_PREFERENCES", "USER_APPROVED"].includes(question.source);
}
