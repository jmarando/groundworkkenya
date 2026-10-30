// How the console writes numbers and times: Kenyan grouping, and Nairobi's clock whatever the
// reader's device or the server is set to, so the page reads the same everywhere.

export const NAIROBI = "Africa/Nairobi";

/** 12,345 */
export const nf = new Intl.NumberFormat("en-KE");

/** "KES 12,345", rounded to the shilling. */
export const kes = (n: number) => `KES ${nf.format(Math.round(n))}`;

/** "21 Oct, 09:30" in Nairobi; "never" for no time. */
export const stamp = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: NAIROBI,
      })
    : "never";

/** "21 Oct" in Nairobi. */
export const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: NAIROBI });

const tenth = (x: number) => String(Math.round(x * 10) / 10);

/** A count short enough for a line of small print: 950, 4.2k, 121k, 1.4M. */
export function short(n: number): string {
  if (n >= 999_500) return `${tenth(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${tenth(n / 1000)}k`;
  return String(Math.round(n));
}
