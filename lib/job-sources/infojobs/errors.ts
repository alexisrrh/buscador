export type InfoJobsErrorCode =
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "UPSTREAM_SERVER_ERROR"
  | "REQUEST_TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export class InfoJobsError extends Error {
  constructor(
    public readonly code: InfoJobsErrorCode,
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "InfoJobsError";
  }
}
