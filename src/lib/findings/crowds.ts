// The rule for crowds: a funeral, church event, harambee, tournament or show in one of the
// campaign's wards in the coming week, found in the news and not yet in the diary. Pure.

import { figuresFor } from "@/lib/atlas-view";
import { CROWD_KIND_NAMES, type CrowdKind } from "@/lib/crowd-events";
import { addDays, dayName } from "@/lib/diary";
import { count, finding, type Finding, type FindingsInput } from "@/lib/findings/core";

/** How many days ahead a crowd is worth a finding. */
export const CROWD_DAYS = 7;
/** At most this many crowd findings, the biggest wards first. */
export const CROWD_MAX = 5;

const A: Record<CrowdKind, string> = {
  funeral: "A funeral",
  church: "A church event",
  sports: "A tournament",
  harambee: "A harambee",
  market: "A market day",
  school: "A school event",
  community: "A community event",
  other: "A gathering",
};

/** A crowd in one of the campaign's wards this coming week, not yet in the diary. */
export function crowdComing(i: FindingsInput): Finding[] {
  if (!i.crowds?.length) return [];
  const last = addDays(i.today, CROWD_DAYS - 1);
  const out: Finding[] = [];
  for (const e of i.crowds) {
    if (e.day < i.today || e.day > last || !e.wardId) continue;
    const w = i.wards.find((x) => x.id === e.wardId);
    if (!w?.key) continue;
    const reg = figuresFor(i.atlas, w.key, i.race, 2022).registered;
    if (!reg) continue;
    const day = dayName(e.day);
    out.push(
      finding(
        "crowd-coming",
        w.key,
        `${A[e.kind]} in ${w.name} on ${day}, a ward of ${count(reg)} registered voters. Not in the diary yet.`,
        [
          {
            label: `${CROWD_KIND_NAMES[e.kind]}: ${e.title}`,
            value: Number(e.day.slice(8, 10)),
            text: day,
            source: e.sourceName ?? "The news",
            period: e.day,
          },
          {
            label: "Registered voters",
            value: reg,
            text: count(reg),
            source: "IEBC",
            period: "2022",
          },
        ],
        { label: "See where the crowds are", to: "/diary" },
        reg,
        `${w.key}:${e.id}`,
      ),
    );
  }
  return out.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, CROWD_MAX);
}
