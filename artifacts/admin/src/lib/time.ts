// All times are shown in Indian Standard Time (IST), whatever the computer's own time zone is.
// The server stores moments in UTC; this is the only place they are turned into IST text.
const TZ = "Asia/Kolkata";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

function partsOf(date: Date) {
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

const two = (n: number) => String(n).padStart(2, "0");

/**
 * Formats a date in IST. Supported pieces: yyyy, MMM, M, d, h, mm, ss, a (am/pm).
 * Example: formatIST(order.createdAt, "d MMM yyyy, h:mm a") -> "23 Oct 2026, 4:05 pm".
 */
export function formatIST(value: Date | string | number | null | undefined, pattern = "d MMM yyyy, h:mm a"): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const p = partsOf(date);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const tokens: Record<string, string> = {
    yyyy: String(p.year),
    MMM: MONTHS[p.month - 1],
    M: String(p.month),
    d: String(p.day),
    h: String(h12),
    mm: two(p.minute),
    ss: two(p.second),
    a: p.hour < 12 ? "am" : "pm",
  };
  return pattern.replace(/yyyy|MMM|mm|ss|M|d|h|a/g, (t) => tokens[t]);
}
