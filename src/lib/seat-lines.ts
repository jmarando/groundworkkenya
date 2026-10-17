// The Path to City Hall readings: plain sentences about where a governor's path
// stands, each with the figures behind every number in it, so the findings
// engine's check (`unaccounted`) holds for them too. Pure. The sums are
// src/lib/seat-path.ts. docs/superpowers/plans/2026-10-17-path-to-city-hall.md.

import { count, percent, type Figure } from "@/lib/findings/core";
import { isBaseline, type Scenario } from "@/lib/path";
import { list, sharePercent, type PathLine } from "@/lib/path-lines";
import type { Seat } from "@/lib/seat";
import { closestSeats, runSeat, seatTurnoutLever, worthSeat } from "@/lib/seat-path";

const MINE = { source: "Your changes on the 2022 map", period: "scenario" };
/** Five points of share is what the "lever" line weighs. */
const FIVE = 5;
/** A lever worth less than this many votes is none. */
const WORTH_LEAST = 100;
const TURNOUT_LEAST = 50;

/** "City Hall" for Nairobi, "County Hall" for every other county. */
export const hallName = (countyName: string): string =>
  countyName === "Nairobi" ? "City Hall" : "County Hall";

const figure = (
  label: string,
  value: number,
  text: string,
  origin: { source: string; period: string },
): Figure => ({ label, value, text, ...origin });

/** About, to the nearest hundred. */
const hundreds = (n: number) => count(Math.round(n / 100) * 100);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

type Lean = { word: "ahead" | "behind" | "level"; n: number };
/** A margin read as a side, to the whole vote: "level" when it rounds to nothing. */
function lean(margin: number): Lean {
  const n = Math.round(Math.abs(margin));
  return n === 0 ? { word: "level", n: 0 } : { word: margin > 0 ? "ahead" : "behind", n };
}
/** "ahead by 728", "behind by 184", "level". */
const short = (l: Lean) => (l.word === "level" ? "level" : `${l.word} by ${count(l.n)}`);
/** "ahead by 125,876 votes", "behind by 1 vote", "level". */
const votes = (l: Lean) =>
  l.word === "level" ? "level" : `${short(l)} ${plural(l.n, "vote", "votes")}`;

/**
 * The readings for a seat and a scenario: where the path stands, the votes that
 * would turn the county, the closest constituencies, the biggest constituency
 * and what five points of share there are worth, the turnout lever and the
 * ticket (the last three worked out on 2022's map), each only when there is
 * something to say.
 */
export function seatLines(seat: Seat, sc: Scenario = {}): PathLine[] {
  const base = isBaseline(sc);
  const run = runSeat(seat, sc);
  const t = run.totals;
  const atlas = {
    source: `${seat.source.constituencies}; ${seat.source.county}`,
    period: "August 2022",
  };
  const origin = base ? atlas : MINE;
  const year = figure("Election year", 2022, "2022", atlas);
  const lines: PathLine[] = [];

  // Where the path stands.
  {
    const lead = lean(t.margin);
    const share = figure("Share of the valid votes", t.share, sharePercent(t.share), origin);
    const carried = figure("Constituencies carried", t.carried, String(t.carried), origin);
    const reported = figure(
      "Constituencies reported separately",
      t.reported,
      String(t.reported),
      atlas,
    );
    const figures: Figure[] = [...(base ? [year] : []), share];
    if (lead.n > 0) figures.push(figure("Votes of margin", t.margin, count(lead.n), origin));
    figures.push(carried, reported);
    let together = "";
    if (t.together) {
      const l = lean(t.together.margin);
      const seats = figure(
        "Seats reported together",
        t.together.seats,
        String(t.together.seats),
        atlas,
      );
      figures.push(seats);
      if (l.n > 0)
        figures.push(figure("Margin in the seats together", t.together.margin, count(l.n), origin));
      together = `, and ${base ? "was" : "is"} ${votes(l)} in the ${seats.text} ${plural(t.together.seats, "seat", "seats")} reported together`;
    }
    lines.push({
      id: "standing",
      line: `${base ? "On 2022's map" : "With your changes"} your side has ${share.text} of the valid votes and is ${votes(lead)}. It ${base ? "carried" : "carries"} ${carried.text} of the ${reported.text} ${plural(t.reported, "constituency", "constituencies")} reported separately${together}.`,
      figures,
    });
  }

  // The votes that would turn the county.
  {
    const turn = figure("Votes that would have to change sides", t.toTurn, count(t.toTurn), origin);
    lines.push({
      id: "turn",
      line: `${turn.text} ${plural(t.toTurn, "vote", "votes")} would have to change sides to turn the county.`,
      figures: [turn],
    });
  }

  // The closest constituencies.
  {
    const near = closestSeats(seat, sc);
    if (near.length) {
      const figures: Figure[] = [];
      const parts = near.map((b) => {
        const l = lean(b.margin);
        if (l.n > 0) figures.push(figure(`Margin in ${b.name}`, b.margin, count(l.n), origin));
        return `${b.name} (${short(l)})`;
      });
      lines.push({
        id: "closest",
        line: `The closest ${plural(near.length, "constituency", "constituencies")}: ${list(parts)}.`,
        figures,
      });
    }
  }

  // The biggest constituency, and what five points of share there are worth.
  {
    const biggest = [...seat.buckets]
      .filter((b) => !b.together)
      .sort((a, b) => b.yours + b.rival - (a.yours + a.rival) || a.name.localeCompare(b.name))[0];
    if (biggest) {
      const w = worthSeat(seat, biggest.key, FIVE);
      if (Math.round(w.margin / 100) * 100 >= WORTH_LEAST) {
        const size = biggest.yours + biggest.rival;
        const two = figure("Votes between the two main candidates", size, count(size), atlas);
        const worth = figure(
          "Votes of margin in five points of share",
          w.margin,
          hundreds(w.margin),
          atlas,
        );
        lines.push({
          id: "lever",
          line: `${biggest.name} is the biggest constituency reported separately, with ${two.text} votes between the two main candidates. Five points of share there is worth about ${worth.text} votes on the margin.`,
          figures: [two, worth],
        });
      }
    }
  }

  // The turnout lever.
  {
    const lever = seatTurnoutLever(seat);
    if (lever && lever.net >= TURNOUT_LEAST) {
      const here = figure(
        "The two main candidates over the register here",
        lever.turnout,
        percent(lever.turnout),
        atlas,
      );
      const there = figure(
        "The same across the county",
        lever.county,
        percent(lever.county),
        atlas,
      );
      const extra = figure(
        "Votes added at the county's level",
        lever.extra,
        hundreds(lever.extra),
        atlas,
      );
      const net = figure("Net votes for your side", lever.net, hundreds(lever.net), atlas);
      lines.push({
        id: "turnout",
        line: `The two main candidates together took ${here.text} of the register in ${lever.name} against ${there.text} across ${seat.countyName} in ${year.text}. Lifting it to the county's level would add about ${extra.text} votes, about ${net.text} net for your side.`,
        figures: [here, year, there, extra, net],
      });
    }
  }

  // The ticket: the governor's votes against the presidential candidate of the same bloc.
  if (seat.president) {
    const p = seat.president;
    const dy = seat.total.yours - p.yours.votes;
    const dr = seat.total.rival - p.rival.votes;
    const both = {
      source: [seat.source.county, seat.source.president].filter(Boolean).join("; "),
      period: "August 2022",
    };
    const figures: Figure[] = [];
    const side = (n: number, same: string, more: string, fewer: string) => {
      if (n === 0) return same;
      const f = figure("Votes against the presidential candidate", n, count(Math.abs(n)), both);
      figures.push(f);
      return `polled ${f.text} ${n > 0 ? more : fewer}`;
    };
    const first = side(dy, "polled as many votes as", "more votes than", "fewer votes than");
    const second = side(dr, "polled as many as", "more than", "fewer than");
    figures.push(figure("Election year", 2022, "2022", both));
    lines.push({
      id: "ticket",
      line: `${seat.yours.name} ${first} ${p.yours.name} did in ${seat.countyName} in 2022; ${seat.rival.name} ${second} ${p.rival.name}.`,
      figures,
    });
  }

  return lines;
}
