import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  OTP_PROVIDER: z.enum(["console"]).optional(),
  OPENAI_API_KEY: z.string().optional(),
  ASR_MODEL: z.string().default("whisper-1"),
  ASR_LANGUAGE: z.string().optional(),
  EXTRACT_MODEL: z.string().default("gpt-4o-mini"),
  CAPTURE_DAILY_LIMIT: z.coerce.number().int().positive().default(200),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parsed lazily so `next build` does not need runtime secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse({
    ...process.env,
    OTP_PROVIDER: process.env.OTP_PROVIDER || undefined,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
    ASR_LANGUAGE: process.env.ASR_LANGUAGE || undefined,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
