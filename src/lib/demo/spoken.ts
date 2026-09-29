// The briefing as something to listen to in the car: about three minutes,
// written for the ear (short sentences, numbers rounded, no tables).

import { ours } from "@/lib/demo";
import { countAtLeast, daysBetween, ELECTION_DAY, weightedShares } from "@/lib/demo/insights";
import type { Scenario } from "@/lib/demo/types";

const nf = new Intl.NumberFormat("en-KE");

function spokenDate(iso: string): string {
  return new Date(`${iso}T09:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Nairobi",
  });
}

/** Said once, before the first invented thing: everything after it is invented too. */
const SAMPLE_NOTE = "From here on, this briefing is a sample, invented for a race like yours.";
const COUNT = ["", "One thing", "Two things", "Three things"];
const ORDINAL = ["First", "Second", "Third"];

/**
 * `name` and `today` let Home read out what it shows: the person signed in and
 * its Today list, real items first. `race` is the real race's verdict; with it
 * the sample race and its rivals are left out. Without them it is the sample.
 */
export function spokenBriefing(
  s: Scenario,
  todayIso: string,
  opts: {
    name?: string;
    today?: { title: string; detail: string; sample: boolean }[];
    race?: string;
  } = {},
): string {
  const us = ours(s);
  const keys = s.contenders.map((c) => c.key);
  const rival = s.contenders[1];
  const own = s.polls.own.shares;
  const model = weightedShares(s.areas, keys);
  const days = daysBetween(todayIso, ELECTION_DAY);
  const out: string[] = [];
  let noted = false;
  const sampleFromHere = () => {
    if (!noted) out.push(SAMPLE_NOTE);
    noted = true;
  };

  out.push(
    `Good morning, ${opts.name ?? s.candidate.first}. It's ${spokenDate(todayIso)}, and ${days} days to the election.`,
  );
  if (opts.race) out.push(`Where you stand: ${opts.race}`);

  const items = opts.today ?? s.today.map((t) => ({ ...t, sample: true }));
  if (items.length) out.push(`${COUNT[items.length] ?? `${items.length} things`} today.`);
  items.forEach((t, i) => {
    if (t.sample) sampleFromHere();
    out.push(`${ORDINAL[i] ?? "Next"}: ${t.title}. ${t.detail}`);
  });
  // The story, the race, rivals, voters and the diary below are all the sample.
  sampleFromHere();

  out.push(`The story that matters: ${s.story.headline}. ${s.story.summary}`);
  out.push(`Why it matters: ${s.story.numbers.map((n) => `${n.value}, ${n.label}`).join("; ")}.`);
  out.push(`${s.story.rivals} Our line: ${s.story.line}`);

  // The sample's race and rivals, unless the real race was said above.
  if (!opts.race) {
    const undecided = own["undecided"] ?? 0;
    out.push(
      `Where you stand. Our latest poll has you on ${own[us.key]}, ${rival?.name ?? "your rival"} on ${own[rival?.key ?? ""]}, and ${undecided} undecided.`,
    );
    if (s.office === "president") {
      const at25 = countAtLeast(s.areas, us.key, 25);
      const share = model[us.key] ?? 0;
      out.push(
        `Among decided voters you're at ${share.toFixed(1)} percent: ${share < 50 ? "short of" : "above"} the 50 percent line. You're at 25 percent or more in ${at25} counties; you need 24.`,
      );
    } else {
      const lead = (model[us.key] ?? 0) - (model[rival?.key ?? ""] ?? 0);
      out.push(`Among decided voters you lead by ${lead.toFixed(1)} points.`);
      if (s.winNumber) {
        out.push(
          `You've found ${nf.format(s.winNumber.found)} of the ${nf.format(s.winNumber.target)} supporters you need.`,
        );
      }
    }

    for (const o of s.opponents) {
      const name = s.contenders.find((c) => c.key === o.key)?.name ?? "A rival";
      out.push(`${name}: ${o.yesterday} Watch for this: ${o.watch}`);
    }
  }

  const top = s.voters.issues[0];
  if (top) {
    out.push(
      `Voters: ${top.label.toLowerCase()} is the first issue for ${top.share} percent, ${top.change >= 0 ? "up" : "down"} ${Math.abs(top.change)} this week, loudest in ${top.hot}.`,
    );
  }

  out.push("Where to be today.");
  for (const d of s.diary.slice(0, 3)) out.push(`At ${d.time}, ${d.place}. ${d.why}`);

  for (const w of s.watch.filter((x) => x.level === "high")) {
    out.push(`Watch: ${w.title}. ${w.detail}`);
  }

  out.push("That's your briefing. Have a good day.");
  return out.join(" ");
}
