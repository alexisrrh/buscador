export type ApplicationMode = "AUTO" | "REVIEW" | "MANUAL";
export type GateState = "PASS" | "FAIL" | "UNKNOWN";
export type QuestionClassification =
  | "SAFE_STRUCTURED" | "USER_CONFIRMATION" | "OPEN_TEXT" | "LEGAL_SENSITIVE" | "UNSUPPORTED";

export type ConnectorCapabilities = {
  supportsDirectApply: boolean;
  supportsResumeUpload: boolean;
  supportsCoverLetter: boolean;
  supportsQuestions: boolean;
  requiresAuthentication: boolean;
  supportsAutoSubmit: boolean;
};

export type ApplicationQuestion = {
  questionKey: string;
  questionText: string;
  answerType: "TEXT" | "BOOLEAN" | "NUMBER" | "SELECT" | "MULTISELECT" | "DATE" | "FILE" | "UNKNOWN";
  classification: QuestionClassification;
  answerValue: unknown | null;
  source: "PROFILE" | "SEARCH_PREFERENCES" | "USER_APPROVED" | "GENERATED" | "PORTAL_DISCOVERY";
  confidence: number;
  requiresConfirmation: boolean;
};

export type ApplicationDecisionInput = {
  draftStatus: string;
  resumeStatus: string;
  offerStatus: string;
  eligibility: string;
  score: number;
  minimumScore: number;
  searchApplicationMode: ApplicationMode;
  userAutoApplyEnabled: boolean;
  sourceAutoApplyEnabled: boolean;
  connector: ConnectorCapabilities | null;
  questions: ApplicationQuestion[];
  hardRequirementsMissing: string[];
  duplicateExists: boolean;
  dailyLimit: number;
  applicationsToday: number;
  hasCaptcha: boolean;
  hasAssessment: boolean;
  hasComplexAuthentication: boolean;
  hasUnsupportedDynamicForm: boolean;
  hasUnexpectedConsent: boolean;
};

export type ApplicationDecision = {
  mode: ApplicationMode;
  blocked: boolean;
  reasons: string[];
  confirmations: string[];
  checklist: Record<string, GateState>;
};
