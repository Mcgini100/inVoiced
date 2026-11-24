import { AppError } from "@/lib/errors";
import type { Repo } from "./repo/types";

/** Fixed-window limiter backed by the database, so it holds across instances. */
export async function enforceLimit(
  repo: Repo,
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date,
  message = "Too many requests. Please wait a moment and try again.",
): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const count = await repo.hit(`${key}:${windowSeconds}`, windowStart);
  if (count > limit) throw new AppError("RATE_LIMITED", message);
}
