export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "UPSTREAM"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  UPSTREAM: 502,
  INTERNAL: 500,
};

/** An error whose message is safe to show to the user. Anything else is reported as a generic failure. */
export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export interface PublicError {
  code: ErrorCode;
  message: string;
}

export function toPublicError(err: unknown): PublicError {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  return { code: "INTERNAL", message: "Something went wrong. Please try again." };
}

export function statusOf(err: unknown): number {
  return err instanceof AppError ? err.status : 500;
}
