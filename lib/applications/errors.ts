const PUBLIC_ERRORS: Record<string, string> = {
  NO_APPROVED_RESUME: "Necesitas aprobar un CV antes de preparar una candidatura.",
  RESUME_EXTRACTION_FAILED: "No se pudo extraer texto del CV aprobado.",
  RESUME_DOWNLOAD_FAILED: "No se pudo descargar el CV aprobado.",
  INVALID_GENERATION: "La adaptación contiene información que no se pudo acreditar en el CV.",
  DRAFT_PERSISTENCE_FAILED: "No se pudo leer o guardar el borrador de candidatura.",
  MISSING_JOB_MATCH: "No se encontró una coincidencia válida para preparar la candidatura.",
  MISSING_JOB_OFFER: "No se encontró la oferta de empleo.",
  MISSING_CANDIDATE_PROFILE: "No se encontró el perfil del candidato.",
  GENERATION_NOT_CONFIGURED: "El generador de candidaturas no está configurado.",
  GENERATION_FAILED: "No se pudo generar la adaptación de la candidatura.",
  APPLICATION_SERVICE_NOT_CONFIGURED: "El servicio de candidaturas no está configurado.",
  APPROVED_DRAFT_IMMUTABLE: "La candidatura aprobada no puede regenerarse.",
  PREPARATION_FAILED: "No se pudo preparar la candidatura.",
};

export class ApplicationPreparationError extends Error {
  constructor(public readonly code: string, public readonly stage: string, cause?: unknown) {
    super(PUBLIC_ERRORS[code] ?? PUBLIC_ERRORS.PREPARATION_FAILED, { cause });
    this.name = "ApplicationPreparationError";
  }
}

export function publicPreparationError(error: unknown) {
  const code = error instanceof ApplicationPreparationError && Object.hasOwn(PUBLIC_ERRORS, error.code)
    ? error.code : "PREPARATION_FAILED";
  return `${PUBLIC_ERRORS[code]} [${code}]`;
}

export function logPreparationError(error: unknown) {
  const known = error instanceof ApplicationPreparationError;
  const cause = known ? error.cause : error;
  const causeCode = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
  // Never log source text, storage URLs, database details, tokens or raw messages.
  console.error("application_preparation_failed", JSON.stringify({
    code: known && Object.hasOwn(PUBLIC_ERRORS, error.code) ? error.code : "PREPARATION_FAILED",
    stage: known ? error.stage : "server-action",
    causeClass: cause instanceof Error ? cause.constructor.name : "Unknown",
    causeCode: typeof causeCode === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(causeCode) ? causeCode : null,
  }));
}
