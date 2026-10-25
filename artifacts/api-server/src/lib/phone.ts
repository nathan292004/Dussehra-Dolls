// Phone numbers are stored in international form, e.g. "+919876543210".
// The app lets the customer pick a country; the picked dial code is sent with the number.

interface Country {
  dial: string; // digits only, no "+"
  min: number; // shortest national number
  max: number; // longest national number
}

// Countries offered in the app (keep in step with artifacts/mobile/constants/countries.ts).
const COUNTRIES: Country[] = [
  { dial: "91", min: 10, max: 10 }, // India
  { dial: "1", min: 10, max: 10 }, // USA / Canada
  { dial: "44", min: 10, max: 10 }, // United Kingdom
  { dial: "971", min: 9, max: 9 }, // UAE
  { dial: "65", min: 8, max: 8 }, // Singapore
  { dial: "61", min: 9, max: 9 }, // Australia
  { dial: "974", min: 8, max: 8 }, // Qatar
  { dial: "966", min: 9, max: 9 }, // Saudi Arabia
  { dial: "968", min: 8, max: 8 }, // Oman
  { dial: "973", min: 8, max: 8 }, // Bahrain
  { dial: "965", min: 8, max: 8 }, // Kuwait
  { dial: "60", min: 9, max: 10 }, // Malaysia
  { dial: "94", min: 9, max: 9 }, // Sri Lanka
  { dial: "977", min: 10, max: 10 }, // Nepal
  { dial: "880", min: 10, max: 10 }, // Bangladesh
  { dial: "64", min: 8, max: 10 }, // New Zealand
  { dial: "49", min: 10, max: 11 }, // Germany
  { dial: "33", min: 9, max: 9 }, // France
];

const DEFAULT_DIAL = "91";

/**
 * Returns the number in international form ("+<country code><number>"), or null if it is not a plausible number.
 * - With a leading "+" the country code is taken from the number itself.
 * - Without one, a 10-digit number (or 0 + 10 digits) is treated as Indian; a longer number is taken to
 *   already start with its country code.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 25) return null;
  if (/[^\d+\-\s().]/.test(input)) return null;
  const trimmed = input.trim();
  if (trimmed.slice(1).includes("+")) return null; // "+" is only allowed as the first character
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let full: string;
  if (trimmed.startsWith("+")) full = digits;
  else if (digits.length === 10) full = DEFAULT_DIAL + digits;
  else if (digits.length === 11 && digits.startsWith("0")) full = DEFAULT_DIAL + digits.slice(1);
  else if (digits.length >= 11) full = digits; // typed with the country code but no "+", e.g. 919876543210
  else return null;

  // Known country: the national part must have the right length (and Indian mobiles start with 6-9).
  const country = COUNTRIES.filter((c) => full.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
  if (country) {
    const national = full.slice(country.dial.length);
    if (national.length < country.min || national.length > country.max) return null;
    if (country.dial === "91" && !/^[6-9]/.test(national)) return null;
  } else if (full.length < 8 || full.length > 15) {
    // Any other country: general international limits (E.164).
    return null;
  }
  if (full.startsWith("0")) return null;
  return "+" + full;
}
