import type { NxeonClient } from "./client";

/**
 * Every operation name, derived from the interface itself so the two cannot
 * drift. Adding a method to `NxeonClient` widens this automatically.
 */
export type NxeonOperation = keyof NxeonClient;

/**
 * Thrown by every method of the not-configured client.
 *
 * A distinct class, not a bare `Error`, because a route has to be able to tell
 * "custom domains are not switched on in this environment" (503, a sentence
 * about the feature) apart from "Nxeon said no" (a sentence about the
 * customer's domain). `instanceof` is the check; the message is for logs.
 *
 * The message names the environment variable on purpose. The person who reads
 * it is an operator staring at a 503 on a fresh deploy, and the single most
 * useful thing to hand them is the name of the thing that is unset.
 */
export class NxeonNotConfiguredError extends Error {
  readonly operation: NxeonOperation;

  constructor(operation: NxeonOperation) {
    super(
      `Nxeon is not configured — cannot ${operation}. ` +
        `Set NXEON_PARTNER_API_URL and NXEON_PARTNER_API_KEY, and deploy a client that implements NxeonClient.`,
    );
    this.name = "NxeonNotConfiguredError";
    this.operation = operation;
  }
}

/**
 * A call reached Nxeon and Nxeon refused it.
 *
 * Defined here rather than in the future HTTP client so that callers written
 * today can already branch on it, and so the only file that has to change when
 * the real client lands is the one that does the fetching.
 *
 * `retryable` is set by the client from the transport's own signals (5xx,
 * timeouts, `Retry-After`). It is NOT inferred by callers from the message.
 */
export class NxeonApiError extends Error {
  readonly operation: NxeonOperation;
  /** HTTP status, or null if the request never got an answer. */
  readonly status: number | null;
  /** Nxeon's machine-readable code, when it sends one. */
  readonly code: string | null;
  readonly retryable: boolean;
  /** From a `Retry-After` header, when present. */
  readonly retryAfter: Date | null;

  constructor(
    operation: NxeonOperation,
    message: string,
    opts: {
      status?: number | null;
      code?: string | null;
      retryable?: boolean;
      retryAfter?: Date | null;
    } = {},
  ) {
    super(message);
    this.name = "NxeonApiError";
    this.operation = operation;
    this.status = opts.status ?? null;
    this.code = opts.code ?? null;
    this.retryable = opts.retryable ?? false;
    this.retryAfter = opts.retryAfter ?? null;
  }
}

/** True for the "this environment has no Nxeon" error specifically. */
export function isNxeonNotConfigured(err: unknown): err is NxeonNotConfiguredError {
  return err instanceof NxeonNotConfiguredError;
}
