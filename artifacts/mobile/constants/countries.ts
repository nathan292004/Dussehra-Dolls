// Countries offered when entering a phone number. Keep in step with artifacts/api-server/src/lib/phone.ts,
// which checks the length of the number for each dial code.
export interface Country {
  code: string; // ISO code
  name: string;
  dial: string; // with "+"
  flag: string;
  /** Shortest and longest national number (without the country code). */
  min: number;
  max: number;
  placeholder: string;
}

export const COUNTRIES: Country[] = [
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳", min: 10, max: 10, placeholder: "98765 43210" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸", min: 10, max: 10, placeholder: "415 555 2671" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦", min: 10, max: 10, placeholder: "604 555 0123" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧", min: 10, max: 10, placeholder: "7400 123456" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪", min: 9, max: 9, placeholder: "50 123 4567" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬", min: 8, max: 8, placeholder: "9123 4567" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺", min: 9, max: 9, placeholder: "412 345 678" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦", min: 8, max: 8, placeholder: "3312 3456" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦", min: 9, max: 9, placeholder: "51 234 5678" },
  { code: "OM", name: "Oman", dial: "+968", flag: "🇴🇲", min: 8, max: 8, placeholder: "9212 3456" },
  { code: "BH", name: "Bahrain", dial: "+973", flag: "🇧🇭", min: 8, max: 8, placeholder: "3600 1234" },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼", min: 8, max: 8, placeholder: "5000 1234" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾", min: 9, max: 10, placeholder: "12 345 6789" },
  { code: "LK", name: "Sri Lanka", dial: "+94", flag: "🇱🇰", min: 9, max: 9, placeholder: "71 234 5678" },
  { code: "NP", name: "Nepal", dial: "+977", flag: "🇳🇵", min: 10, max: 10, placeholder: "98 1234 5678" },
  { code: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩", min: 10, max: 10, placeholder: "1712 345678" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿", min: 8, max: 10, placeholder: "21 123 4567" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪", min: 10, max: 11, placeholder: "1512 3456789" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷", min: 9, max: 9, placeholder: "6 12 34 56 78" },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // India, +91

/** Turns what was typed into the international number sent to the server, e.g. "+919876543210". */
export function toInternational(country: Country, typed: string): string {
  let digits = typed.replace(/\D/g, "");
  // Someone may paste a number that already starts with the code or a leading 0.
  const dialDigits = country.dial.slice(1);
  if (digits.startsWith(dialDigits) && digits.length > country.max) digits = digits.slice(dialDigits.length);
  digits = digits.replace(/^0+/, "");
  return country.dial + digits;
}

/** A readable problem with the typed number for the chosen country, or null if it looks fine. */
export function phoneProblem(country: Country, typed: string): string | null {
  const international = toInternational(country, typed);
  const national = international.slice(country.dial.length);
  if (!national) return "Please enter your phone number";
  if (national.length < country.min || national.length > country.max) {
    return country.min === country.max
      ? `A ${country.name} number has ${country.min} digits`
      : `A ${country.name} number has ${country.min} to ${country.max} digits`;
  }
  if (country.code === "IN" && !/^[6-9]/.test(national)) return "An Indian mobile number starts with 6, 7, 8 or 9";
  return null;
}
