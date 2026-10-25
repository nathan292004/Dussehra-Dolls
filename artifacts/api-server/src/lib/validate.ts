import { z, ZodError, type ZodTypeAny } from "zod";
import { HttpError } from "./http-error";
import { parsePaise, paiseToDecimal } from "./money";

export { z };

/** Parses request data with a schema; on failure throws a 400 with the first problem in plain words. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  throw new HttpError(400, firstProblem(result.error), "VALIDATION_FAILED");
}

export function firstProblem(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const field = issue.path.length ? String(issue.path[issue.path.length - 1]) : "";
  // Messages written by us are already complete sentences; generic zod ones get the field name.
  return issue.code === "custom" || (issue.message && !/^(Required|Invalid)/i.test(issue.message))
    ? issue.message
    : field ? `${field}: ${issue.message}` : issue.message;
}

// ─── Reusable field rules ────────────────────────────────────────────────────

/** A positive whole number id from a URL parameter. */
export const idParam = z.coerce.number().int().min(1).max(2_147_483_647);

/** Text trimmed and length limited; empty becomes null when optional. */
export const text = (label: string, min: number, max: number) =>
  z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(min, `${label} must be at least ${min} character${min === 1 ? "" : "s"}`)
    .max(max, `${label} must be at most ${max} characters`);

export const optionalText = (label: string, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().trim().max(max, `${label} must be at most ${max} characters`).nullable(),
  );

/** Rupee amount with at most 2 decimals, kept as a decimal string (e.g. "499.50"). */
export const rupees = (label: string, { min = 0, max = 10_000_000 } = {}) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const paise = parsePaise(v);
    if (paise === null || paise < min * 100 || paise > max * 100) {
      ctx.addIssue({
        code: "custom",
        message: `${label} must be an amount from ${min} to ${max} with at most 2 decimals`,
      });
      return z.NEVER;
    }
    return paiseToDecimal(paise);
  });

export const phoneField = z.string().trim().min(8).max(25);

export const emailField = z.string().trim().toLowerCase().email("Enter a valid email address").max(120);
