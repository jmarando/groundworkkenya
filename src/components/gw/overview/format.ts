// Number formats for the Overview: whole numbers, short forms for big ones,
// shillings and percentages.

export const nf = new Intl.NumberFormat("en-KE");

const short = new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 1 });

/** 4,386,000 → "4.4M", 38,500 → "38.5K", 950 → "950". */
export const compact = (n: number) => (Math.abs(n) >= 10_000 ? short.format(n) : nf.format(n));

/** Shillings, short: "KES 3.1B", "KES 412K". */
export const kes = (n: number) => `KES ${short.format(n)}`;

/** A share as a whole percentage: 0.648 → "65%". */
export const pct = (part: number, whole: number) =>
  `${whole > 0 ? Math.round((part / whole) * 100) : 0}%`;
