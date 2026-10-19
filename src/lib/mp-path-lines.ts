// The Path to Parliament readings: plain sentences about where an MP's (or
// MCA's) path stands, each with the figures behind every number in it. Pure.
// The sums are src/lib/mp-path.ts.

import { count, percent, type Figure } from "@/lib/findings/core";
import {
  pointWorth,
  runMp,
  turnoutWorth,
  isMpBaseline,
  type MpScenario,
  type MpSeat,
  NO_MP_MOVE,
} from "@/lib/mp-path";
import { sharePercent, type PathLine } from "@/lib/path-lines";

const MINE = { source: "Your changes on the result", period: "scenario" };
/** The turnout move the lever line weighs, in points. */
const FIVE = 5;

const figure = (
  label: string,
  value: number,
  text: string,
  origin: { source: string; period: string },
): Figure => ({ label, value, text, ...origin });

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** About, to the nearest ten. */
const tens = (n: number) => count(Math.round(n / 10) * 10);

/**
 * The readings for a seat and a scenario: where the path stands, the votes that
 * would turn it, what a point of share is worth against what turnout in the
 * biggest ward is worth, the turnout of the two, and the race before.
 */
export function mpLines(seat: MpSeat, sc: MpScenario = NO_MP_MOVE): PathLine[] {
  const base = isMpBaseline(sc);
  const run = runMp(seat, sc);
  const result = { source: seat.source.result, period: String(seat.year) };
  const register = { source: seat.source.register, period: String(seat.year) };
  const out: PathLine[] = [];
  const year = figure("Election", seat.year, String(seat.year), result);

  // Where it stands.
  const gap = Math.round(Math.abs(run.margin));
  const share = figure(
    "Your side's share of the two",
    run.share,
    sharePercent(run.share),
    base ? result : MINE,
  );
  const margin = figure("Margin", gap, count(gap), base ? result : MINE);
  const yours = figure(
    seat.yours.name,
    Math.round(run.yours),
    count(Math.round(run.yours)),
    base ? result : MINE,
  );
  const rival = figure(
    seat.rival.name,
    Math.round(run.rival),
    count(Math.round(run.rival)),
    base ? result : MINE,
  );
  out.push({
    id: "stands",
    figures: [year, yours, rival, margin, share],
    line:
      gap === 0
        ? `${base ? `In ${year.text}` : "With your changes"} ${seat.yours.name} and ${seat.rival.name} are level on ${yours.text} votes each.`
        : `${base ? `In ${year.text}` : "With your changes"} ${seat.yours.name} ${base ? "had" : "has"} ${yours.text} votes to ${seat.rival.name}'s ${rival.text}: ${run.leads ? "ahead" : "behind"} by ${margin.text}, ${share.text} of the two together.`,
  });

  // The votes that would turn it.
  if (run.leads) {
    const turn = figure("Votes to turn it", run.toTurn, count(run.toTurn), base ? result : MINE);
    out.push({
      id: "turn",
      figures: [margin, turn],
      line: `${turn.text} ${plural(run.toTurn, "voter", "voters")} changing sides would turn it: half the margin, and one.`,
    });
  }

  // A point of share against turnout in the biggest ward.
  const point = pointWorth(seat);
  const worth = figure("One point of share on the margin", point, tens(point), result);
  const big = seat.parts[0];
  if (big) {
    const w = turnoutWorth(seat, big, FIVE);
    const reg = figure(`${big.name} registered`, big.registered, count(big.registered), register);
    const voters = figure(
      `Five points of turnout in ${big.name}`,
      w.voters,
      tens(w.voters),
      result,
    );
    const net = figure(
      "On the margin at the seat's split",
      Math.abs(w.net),
      tens(Math.abs(w.net)),
      result,
    );
    out.push({
      id: "lever",
      figures: [worth, reg, voters, net],
      line: `One point of share is worth about ${worth.text} votes on the margin. Five more points of turnout in ${big.name}, the biggest ward (${reg.text} registered), brings about ${voters.text} voters but only about ${net.text} on the margin at the seat's split${Math.abs(w.net) < point ? ": in a seat this close, changing minds moves more than turning out." : "."}`,
    });
  } else {
    out.push({
      id: "lever",
      figures: [worth],
      line: `One point of share is worth about ${worth.text} votes on the margin.`,
    });
  }

  // Turnout of the two.
  const two = seat.yours.votes + seat.rival.votes;
  const t = two / seat.registered;
  const turnout = figure("The two main candidates over the register", t, percent(t), result);
  const registered = figure("Registered", seat.registered, count(seat.registered), register);
  out.push({
    id: "turnout",
    figures: [turnout, registered, year],
    line: `The two main candidates together took ${turnout.text} of the ${registered.text} registered in ${year.text}.`,
  });

  // The race before.
  const b = seat.before;
  if (b) {
    const origin = { source: seat.source.before ?? "", period: String(b.year) };
    const won = figure(b.winner.name, b.winner.votes, count(b.winner.votes), origin);
    const then = figure("Election", b.year, String(b.year), origin);
    const figs = [then, won];
    let tail = "";
    if (b.valid) {
      const of = figure("Valid votes", b.valid, count(b.valid), origin);
      const pct = figure(
        "Winner's share",
        b.winner.votes / b.valid,
        percent(b.winner.votes / b.valid),
        origin,
      );
      figs.push(of, pct);
      tail = ` of ${of.text} valid votes (${pct.text})`;
    }
    if (b.second) {
      const second = figure(b.second.name, b.second.votes, count(b.second.votes), origin);
      figs.push(second);
      tail += `; the runner-up, ${b.second.name}, had ${second.text}`;
    }
    out.push({
      id: "before",
      figures: figs,
      line: `In ${then.text} ${b.winner.name} won with ${won.text}${tail}.`,
    });
  }
  return out;
}
