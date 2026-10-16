// What the Path to State House screen works out for itself, so it can be
// tested without the screen: the side a campaign starts from, the moves kept
// for each region, and how a move or a lead is worded. Pure.
// docs/superpowers/plans/2026-10-17-path-to-state-house.md.

import { count } from "@/lib/findings/core";
import type { Move, Scenario, Side } from "@/lib/path";

/** How far each slider reaches, in points either way. */
export const RANGE = { share: 20, turnout: 15 } as const;

const words = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** A campaign's 2022 bloc ("Kenya Kwanza", "Azimio") as the side to start from; null for any other. */
export function sideFromBloc(bloc: string | null | undefined): Side | null {
  const b = words(bloc ?? "");
  if (b === "kenya kwanza" || b.startsWith("kenya kwanza ")) return "ruto";
  if (b === "azimio" || b.startsWith("azimio ")) return "raila";
  return null;
}

/** `sc` with part of one region's move set; a region left at zero and zero is dropped. Never changes `sc`. */
export function setMove(sc: Scenario, region: string, patch: Partial<Move>): Scenario {
  const next: Move = { share: 0, turnout: 0, ...sc[region], ...patch };
  const rest = { ...sc };
  delete rest[region];
  return next.share === 0 && next.turnout === 0 ? rest : { ...rest, [region]: next };
}

/** "+5", "−3" (a true minus), "0"; a whole number with thousands, then `unit`. */
export function signed(n: number, unit = ""): string {
  const r = Math.round(n);
  if (r === 0) return `0${unit}`;
  return `${r > 0 ? "+" : "−"}${count(Math.abs(r))}${unit}`;
}

/** The lead over the rival: "Ahead by 233,211", "Behind by …", or "Level" when it rounds to nothing. */
export function lead(margin: number): { label: "Ahead by" | "Behind by" | "Level"; text: string } {
  const r = Math.round(margin);
  if (r === 0) return { label: "Level", text: "" };
  return { label: r > 0 ? "Ahead by" : "Behind by", text: count(Math.abs(r)) };
}

/** Biggest first, a tie by name; the list given is left as it is. */
export function bySize<T extends { name: string; valid: number }>(regions: T[]): T[] {
  return [...regions].sort((a, b) => b.valid - a.valid || a.name.localeCompare(b.name));
}
