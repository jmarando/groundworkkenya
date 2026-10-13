// A campaign's profile of a place: how it lives, who lives there and who it
// listens to, as the team knows it. About places, never about people: nobody's
// tribe is recorded. Pure: the server checks input with this before the
// database checks again.

import { cleanHome } from "@/lib/elections-view";

export const SETTLEMENTS = [
  ["high-income", "High-income residential"],
  ["middle-income", "Middle-income estates"],
  ["low-income", "Low-income estates"],
  ["informal", "Informal settlement"],
  ["mixed", "Mixed"],
  ["peri-urban", "Peri-urban or rural"],
  ["commercial", "Commercial"],
] as const;
export type Settlement = (typeof SETTLEMENTS)[number][0];

export const LANGUAGES = [
  ["en", "English"],
  ["sw", "Swahili"],
  ["sheng", "Sheng"],
  ["kikuyu", "Kikuyu"],
  ["luo", "Dholuo"],
  ["luhya", "Luhya"],
  ["kamba", "Kamba"],
  ["kisii", "Ekegusii"],
  ["somali", "Somali"],
  ["kalenjin", "Kalenjin"],
  ["meru", "Meru"],
  ["other", "Other"],
] as const;
export type Language = (typeof LANGUAGES)[number][0];

export const PROFILE_LIMITS = { communities: 500, institutions: 1000, issues: 500 } as const;
/** Who reads and writes profiles: everyone on the team but field agents. */
export const PROFILE_EDITORS = ["super", "candidate", "manager", "organiser"] as const;

export type AreaProfile = {
  area: string;
  settlement: Settlement | null;
  communities: string | null;
  languages: Language[];
  institutions: string | null;
  issues: string | null;
  updatedAt: string | null;
  /** The name of whoever last saved it, when the team can see it. */
  updatedBy: string | null;
};
export type ProfileInput = Omit<AreaProfile, "updatedAt" | "updatedBy">;

const WHAT: Record<keyof typeof PROFILE_LIMITS, string> = {
  communities: "communities",
  institutions: "institutions and influencers",
  issues: "local issues",
};

/** A profile as typed, checked: a place, a listed settlement type and languages, each box within its limit. */
export function cleanProfile(input: {
  area?: unknown;
  settlement?: unknown;
  communities?: unknown;
  languages?: unknown;
  institutions?: unknown;
  issues?: unknown;
}): ProfileInput {
  const { area } = cleanHome({ area: input?.area });
  const s = typeof input?.settlement === "string" && input.settlement ? input.settlement : null;
  if (s !== null && !SETTLEMENTS.some(([id]) => id === s))
    throw new Error("Pick a settlement type from the list.");
  const langs = Array.isArray(input?.languages) ? input.languages.map(String) : [];
  if (langs.some((l) => !LANGUAGES.some(([id]) => id === l)))
    throw new Error("Pick languages from the list.");
  const text = (name: keyof typeof PROFILE_LIMITS): string | null => {
    const raw = input?.[name];
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v.length > PROFILE_LIMITS[name])
      throw new Error(
        `Keep ${WHAT[name]} to ${PROFILE_LIMITS[name].toLocaleString("en-KE")} characters.`,
      );
    return v || null;
  };
  return {
    area,
    settlement: s as Settlement | null,
    communities: text("communities"),
    languages: [...new Set(langs)] as Language[],
    institutions: text("institutions"),
    issues: text("issues"),
  };
}

/** Nothing written yet. */
export const isEmptyProfile = (p: AreaProfile | null | undefined): boolean =>
  !p || (!p.settlement && !p.communities && !p.languages.length && !p.institutions && !p.issues);

export const settlementName = (s: Settlement): string =>
  SETTLEMENTS.find(([id]) => id === s)?.[1] ?? s;

export const languageNames = (ls: Language[]): string =>
  ls.map((l) => LANGUAGES.find(([id]) => id === l)?.[1] ?? l).join(", ");
