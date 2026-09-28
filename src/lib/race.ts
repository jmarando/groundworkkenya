// The race a campaign is fighting, and the result form that goes with it.
// Kenya numbers the polling-station forms by election: 34A for president
// through 39A for woman representative. A campaign's race is its `level` in
// the campaigns table ("president", "governor", "mp", ...).

export type RaceOffice = "president" | "governor" | "senator" | "woman_rep" | "mp" | "mca";

export const RACE_OFFICES: { key: RaceOffice; label: string; form: string }[] = [
  { key: "president", label: "President", form: "34A" },
  { key: "governor", label: "Governor", form: "37A" },
  { key: "senator", label: "Senator", form: "38A" },
  { key: "woman_rep", label: "Woman Representative", form: "39A" },
  { key: "mp", label: "Member of Parliament", form: "35A" },
  { key: "mca", label: "Member of County Assembly", form: "36A" },
];

const byKey = new Map(RACE_OFFICES.map((o) => [o.key, o]));

/** Other ways a level gets written, to the key above. */
const ALIASES: Record<string, RaceOffice> = {
  presidential: "president",
  member_of_parliament: "mp",
  woman_representative: "woman_rep",
  women_rep: "woman_rep",
  member_of_county_assembly: "mca",
};

/** A campaign level, however it is written, as one of the races; null when unknown. */
export function raceOf(level: string | null | undefined): RaceOffice | null {
  const k = (level ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (byKey.has(k as RaceOffice)) return k as RaceOffice;
  return ALIASES[k] ?? null;
}

/** The polling-station result form for a race; 34A when the race is unknown. */
export function resultForm(level: string | null | undefined): string {
  const race = raceOf(level);
  return (race && byKey.get(race)?.form) || "34A";
}

export function officeLabel(level: string | null | undefined): string {
  const race = raceOf(level);
  return (race && byKey.get(race)?.label) || "Election";
}

/** What the race covers, for "The county, counted." */
export function raceArea(level: string | null | undefined): string {
  const race = raceOf(level);
  if (race === "president") return "country";
  if (race === "mp") return "constituency";
  if (race === "mca") return "ward";
  return "county";
}
