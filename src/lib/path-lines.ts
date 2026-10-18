// The Path to State House readings: plain sentences about where a path stands,
// each with the figures behind every number in it, so the findings engine's
// check (`unaccounted`) holds for them too. Pure. The sums are src/lib/path.ts.
// docs/superpowers/plans/2026-10-17-path-to-state-house.md.

import { count, percent, type Figure } from "@/lib/findings/core";
import type { Kenya } from "@/lib/kenya";
import {
  isBaseline,
  nearLine,
  RULE,
  runPath,
  turnoutLever,
  worth,
  type Scenario,
  type Side,
} from "@/lib/path";

/** One reading: its id (the presidential and the governor's differ), its sentence, and the figure behind each number in it. */
export type PathLine = {
  id: string;
  line: string;
  figures: Figure[];
};

const IEBC = { source: "IEBC Form 34C, 2022 president, county rows", period: "August 2022" };
const MINE = { source: "Your changes on the 2022 map", period: "scenario" };
const ARTICLE = { source: "Constitution, Article 138", period: "in force" };
const SCHEDULE = { source: "Constitution, First Schedule", period: "in force" };

/** Five points of share is what the "biggest" line weighs. */
const FIVE = 5;
/** Counties named in the "counties" line. */
const NAMED = 4;

/**
 * A share as a percentage with one decimal; more decimals when one would print
 * 50.0% for a share that is not exactly half, so "short of half" never reads
 * as 50.0%.
 */
export function sharePercent(x: number): string {
  let text = "";
  for (const decimals of [1, 2, 3, 4]) {
    text = (x * 100).toFixed(decimals);
    if (Number(text) !== 50 || x === 0.5) break;
  }
  return `${text}%`;
}

const figure = (
  label: string,
  value: number,
  text: string,
  origin: { source: string; period: string },
): Figure => ({ label, value, text, ...origin });

/** About: to the ten under a thousand, the hundred under ten thousand, else the thousand. */
export function thousands(n: number): string {
  const unit = n < 1000 ? 10 : n < 10000 ? 100 : 1000;
  return count(Math.round(n / unit) * unit);
}
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "A", "A and B", "A, B and C". */
export function list(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The readings for a side and a scenario. Where the path stands (always); the
 * biggest region and what five points of share there are worth, and the
 * turnout lever, both worked out on 2022's map; and, when the county bar is
 * missed, the counties nearest the line.
 */
export function pathLines(k: Kenya, side: Side, sc: Scenario = {}): PathLine[] {
  const lines: PathLine[] = [];
  const base = isBaseline(sc);
  const t = runPath(k, side, sc).totals;
  const origin = base ? IEBC : MINE;
  const year = figure("Election year", 2022, "2022", IEBC);
  const quarter = figure("County threshold", RULE.countyShare, "25%", ARTICLE);

  // Where the path stands.
  {
    const share = figure("Share of valid votes", t.share, sharePercent(t.share), origin);
    const at = figure("Counties at 25% or more", t.counties, String(t.counties), origin);
    const of = figure("Counties in Kenya", RULE.counties, String(RULE.counties), SCHEDULE);
    const figures = [share, at, of, quarter, ...(base ? [year] : [])];
    const need = Math.max(0, RULE.countiesNeeded - t.counties);
    const shortVotes = t.toHalf > 0;
    const shortCounties = need > 0;
    const parts: string[] = [];
    if (shortVotes) {
      figures.push(figure("Votes short of more than half", t.toHalf, count(t.toHalf), origin));
      parts.push(
        `is ${count(t.toHalf)} ${plural(t.toHalf, "vote", "votes")} short of more than half`,
      );
    }
    if (shortCounties) {
      figures.push(figure("Counties short of the bar", need, String(need), origin));
      parts.push(
        `${shortVotes ? "needs" : "It needs"} ${need} more ${plural(need, "county", "counties")} at 25%`,
      );
    }
    const verdict = parts.length
      ? `${shortVotes ? "It " : ""}${parts.join(" and ")}.`
      : "Both bars are cleared.";
    lines.push({
      id: "standing",
      line: `${base ? "On 2022's map" : "With your changes"} your side has ${share.text} of valid votes and ${quarter.text} or more in ${at.text} of ${of.text} counties. ${verdict}`,
      figures,
    });
  }

  // The biggest region, and what five points of share there are worth.
  {
    const biggest = [...runPath(k, side).regions].sort((a, b) => b.valid - a.valid)[0];
    if (biggest) {
      const w = worth(k, side, biggest.id, FIVE);
      if (w.votes >= 1000) {
        const weight = figure(
          "Share of all valid votes",
          biggest.weight,
          percent(biggest.weight),
          IEBC,
        );
        const votes = figure("Votes in five points of share", w.votes, thousands(w.votes), IEBC);
        const points = figure(
          "National points in five points of share",
          w.points,
          w.points.toFixed(1),
          IEBC,
        );
        lines.push({
          id: "biggest",
          line: `On ${year.text}'s map, ${biggest.name} is the biggest region, ${weight.text} of valid votes. Five points of your side's share there is worth about ${votes.text} votes, ${points.text} points nationally.`,
          figures: [year, weight, votes, points],
        });
      }
    }
  }

  // The turnout lever.
  {
    const lever = turnoutLever(k, side);
    if (lever) {
      const here = figure("The region's turnout", lever.turnout, percent(lever.turnout), IEBC);
      const there = figure("National turnout", lever.national, percent(lever.national), IEBC);
      const extra = figure(
        "Votes added at the national turnout",
        lever.extra,
        thousands(lever.extra),
        IEBC,
      );
      const net = figure("Net votes for your side", lever.net, thousands(lever.net), IEBC);
      lines.push({
        id: "turnout",
        line: `${lever.name} turned out at ${here.text} in ${year.text} against ${there.text} nationally. Lifting it to the national level would add about ${extra.text} votes, about ${net.text} net for your side.`,
        figures: [here, year, there, extra, net],
      });
    }
  }

  // The counties nearest the line, once the county bar is missed.
  if (!t.clearsCounties) {
    const near = nearLine(k, side, sc)
      .slice(0, NAMED)
      .map((c) => c.name);
    if (near.length)
      lines.push({
        id: "counties",
        line: `The nearest counties under the ${quarter.text} line for your side: ${list(near)}.`,
        figures: [quarter],
      });
  }

  return lines;
}
