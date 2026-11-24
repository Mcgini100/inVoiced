type Level = "info" | "warn" | "error";

/** One JSON object per line; never pass secrets, OTP codes or raw audio in `fields`. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { error: err.name, message: err.message, stack: err.stack };
  return { error: String(err) };
}
