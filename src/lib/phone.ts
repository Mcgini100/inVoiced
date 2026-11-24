import { AppError } from "./errors";

/**
 * Normalise a phone number to E.164. Local Zimbabwean forms ("0771234567",
 * "771234567") are assumed to be +263; anything else must carry a country code.
 */
export function normalisePhone(input: string): string {
  let s = input.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{9}$/.test(s)) s = "+263" + s.slice(1);
  else if (/^7\d{8}$/.test(s)) s = "+263" + s;
  else if (/^263\d{9}$/.test(s)) s = "+" + s;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) {
    throw new AppError("VALIDATION", "Enter a valid phone number, for example 0771234567.");
  }
  return s;
}
