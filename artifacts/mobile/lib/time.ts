// Every date and time in the app is shown in Indian Standard Time (IST), whatever the phone's own time zone is.
// The server sends moments in UTC.
const TZ = "Asia/Kolkata";

export function formatDateIST(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

export function formatDateTimeIST(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ,
  });
}
