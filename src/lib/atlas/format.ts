// How the atlas writes its figures: shares to one decimal place, turnout as a whole percentage,
// votes with thousands separators, a missing figure as missing, and the tag each figure carries
// to say where it came from. Pure.

import type { Level } from "./types";

/** What a figure that is not there reads as. Never "0". */
export const MISSING = "not found yet";

const nf = new Intl.NumberFormat("en-KE");
// toFixed rounds the binary value, so 12.35 comes out as 12.3. Intl rounds the decimal, half up.
const nf1 = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtVotes = (n: number | null): string =>
  n === null ? MISSING : nf.format(Math.round(n));

export const fmtShare = (n: number | null): string => (n === null ? MISSING : `${nf1.format(n)}%`);

export const fmtTurnout = (n: number | null): string =>
  n === null ? MISSING : `${Math.round(n)}%`;

/** Points are a size: the words around them say which way. */
export const fmtPoints = (n: number | null): string =>
  n === null ? MISSING : `${nf1.format(Math.abs(n))} points`;

/** A source reads "Publisher, document title"; the tag keeps the publisher. */
const publisher = (source: string): string => source.split(",")[0]?.trim() || source.trim();

/** "IEBC · constituency total · 2022": a result counted at that level, in that year. */
export const resultTag = (source: string, level: Level, year: number): string =>
  `${publisher(source)} · ${level} total · ${year}`;

/** "IEBC · ward register · 2022". */
export const registerTag = (source: string, level: Level, year: number): string =>
  `${publisher(source)} · ${level} register · ${year}`;

/** "WorldPop estimate · 2025": a population figure that is an estimate, never a count. */
export const estimateTag = (source: string, year: number): string =>
  `${publisher(source)} estimate · ${year}`;
