import { z } from "zod";
import { ContextSchema, CurrencySchema, MethodSchema } from "@/lib/domain";

const amount = z.union([z.string().max(20), z.number()]);
const description = z.string().trim().max(200);

export const EntryInputSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  context: ContextSchema,
  amount,
  currency: CurrencySchema,
  method: MethodSchema,
  description: description.optional(),
});
export type EntryInput = z.infer<typeof EntryInputSchema>;

export const EditInputSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  context: ContextSchema.optional(),
  amount: amount.optional(),
  currency: CurrencySchema.optional(),
  method: MethodSchema.optional(),
  description: description.optional(),
});
export type EditInput = z.infer<typeof EditInputSchema>;

export const TransferInputSchema = z.object({
  amount,
  fromCurrency: CurrencySchema,
  method: MethodSchema,
  description: description.optional(),
  rate: z.union([z.string().max(20), z.number()]),
});
export type TransferInput = z.infer<typeof TransferInputSchema>;

export const RateInputSchema = z.union([z.string().max(20), z.number()]).nullable();
export const IdSchema = z.string().uuid();
export const CursorSchema = z.string().uuid().nullable().optional();

/** What the extraction model must return. Unknown keys are dropped, never passed on. */
export const VoiceNewSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  context: ContextSchema,
  amount: z.number().positive(),
  currency: CurrencySchema,
  method: MethodSchema,
  description: description.optional().default(""),
});

export const VoiceUpdatesSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  context: ContextSchema.optional(),
  amount: z.number().positive().optional(),
  currency: CurrencySchema.optional(),
  method: MethodSchema.optional(),
  description: description.optional(),
});
