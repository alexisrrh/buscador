export type PublicJobSourceErrorCode =
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_SERVER_ERROR"
  | "REQUEST_TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export class PublicJobSourceError extends Error {
  constructor(
    public readonly code: PublicJobSourceErrorCode,
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "PublicJobSourceError";
  }
}

export interface PublicJsonClientConfig {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  requestIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export class PublicJsonClient {
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly requestIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private lastRequestAt = 0;

  constructor(config: PublicJsonClientConfig = {}) {
    this.fetchImplementation = config.fetchImplementation ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.backoffMs = config.backoffMs ?? 250;
    this.requestIntervalMs = config.requestIntervalMs ?? 200;
    this.sleep =
      config.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = config.now ?? Date.now;
  }

  async get(url: URL): Promise<unknown> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.throttle();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImplementation(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (response.status === 404) {
          throw new PublicJobSourceError(
            "NOT_FOUND",
            "Public job source identifier was not found.",
            404,
          );
        }

        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.maxRetries) {
            const retryAfter = Number(response.headers.get("retry-after"));
            const delay = Number.isFinite(retryAfter) && retryAfter >= 0
              ? retryAfter * 1_000
              : this.backoffMs * 2 ** attempt;
            await this.sleep(delay);
            continue;
          }
          throw new PublicJobSourceError(
            response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_SERVER_ERROR",
            response.status === 429
              ? "Public job source rate limit exceeded."
              : "Public job source is temporarily unavailable.",
            response.status,
          );
        }

        if (!response.ok) {
          throw new PublicJobSourceError(
            "INVALID_RESPONSE",
            `Public job source request failed with status ${response.status}.`,
            response.status,
          );
        }

        try {
          return JSON.parse(await response.text()) as unknown;
        } catch {
          throw new PublicJobSourceError(
            "INVALID_RESPONSE",
            "Public job source returned invalid JSON.",
            response.status,
          );
        }
      } catch (error) {
        if (error instanceof PublicJobSourceError) throw error;
        if (controller.signal.aborted) {
          if (attempt < this.maxRetries) {
            await this.sleep(this.backoffMs * 2 ** attempt);
            continue;
          }
          throw new PublicJobSourceError(
            "REQUEST_TIMEOUT",
            "Public job source request timed out.",
          );
        }
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs * 2 ** attempt);
          continue;
        }
        throw new PublicJobSourceError(
          "NETWORK_ERROR",
          "Public job source network request failed.",
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new PublicJobSourceError("NETWORK_ERROR", "Public job source request failed.");
  }

  private async throttle() {
    const waitMilliseconds = this.lastRequestAt + this.requestIntervalMs - this.now();
    if (waitMilliseconds > 0) await this.sleep(waitMilliseconds);
    this.lastRequestAt = this.now();
  }
}
