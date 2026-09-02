import type { ApplicationQuestion, ConnectorCapabilities } from "./types";

export type ApplicationInspection = {
  questions: ApplicationQuestion[];
  hasCaptcha: boolean;
  hasAssessment: boolean;
  hasComplexAuthentication: boolean;
  hasUnsupportedDynamicForm: boolean;
  hasUnexpectedConsent: boolean;
};

export interface ApplicationConnector {
  readonly code: string;
  readonly capabilities: ConnectorCapabilities;
  supports(sourceCode: string): boolean;
  inspectApplication(targetUrl: string): Promise<ApplicationInspection>;
  prepare(): Promise<void>;
  submit(): Promise<never>;
}

export const NO_SUBMISSION_CAPABILITIES: ConnectorCapabilities = {
  supportsDirectApply: false,
  supportsResumeUpload: false,
  supportsCoverLetter: false,
  supportsQuestions: false,
  requiresAuthentication: false,
  supportsAutoSubmit: false,
};

export class ManualOnlyConnector implements ApplicationConnector {
  readonly code = "MANUAL_ONLY";
  readonly capabilities = NO_SUBMISSION_CAPABILITIES;
  supports() { return false; }
  async inspectApplication(): Promise<ApplicationInspection> {
    return { questions: [], hasCaptcha: false, hasAssessment: false, hasComplexAuthentication: false, hasUnsupportedDynamicForm: false, hasUnexpectedConsent: false };
  }
  async prepare() {}
  async submit(): Promise<never> {
    throw new Error("REAL_SUBMISSION_NOT_IMPLEMENTED");
  }
}

export function connectorForSource(sourceCode: string | null): ApplicationConnector {
  void sourceCode;
  return new ManualOnlyConnector();
}
