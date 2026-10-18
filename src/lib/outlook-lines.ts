// The Outlook 2027 readings: plain sentences about where a plan for 2027
// stands, what a split field does, what the new registrations would have to do
// and what 2022's votes and the estimates say, each with the figures behind
// every number in it so the findings engine's check (`unaccounted`) holds for
// them too. Pure. The sums are src/lib/outlook.ts. Nothing here forecasts: a
// reading says what would have to be true. Nothing here is about any person's
// or community's vote.
// docs/superpowers/plans/2026-10-18-outlook-2027.md.

import { count, percent, type Figure } from "@/lib/findings/core";
import { isBaseline, simulate, withBack, type Outlook, type Plan } from "@/lib/outlook";
import { list, sharePercent, type PathLine } from "@/lib/path-lines";
import { lean, plural, seatLines, short } from "@/lib/seat-lines";

const MINE = { source: "Your plan for 2027", period: "scenario" };
/** A constituency is close when the margin is at most this share of its votes. */
const CLOSE = 0.05;
/** Constituencies named in the "closest" reading. */
const NEAR = 4;

const figure = (
  label: string,
  value: number,
  text: string,
  origin: { source: string; period: string },
): Figure => ({ label, value, text, ...origin });
const whole = (x: number) => count(Math.round(x));
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

/** What a Senate bid does and does not change for a governor's race. No numbers. */
export const SENATE_NOTE =
  "The Senate seat and the governor's seat are on separate ballot papers, so a Senate bid cannot take a vote from a governor candidate. What it can change here is which candidate a party backs for governor, how many of a side's voters turn out, and how many vote the two papers differently. Those are the things the sliders above set, and the readings change when they do.";

/** Plain notes for the Nairobi block of the screen. No numbers. */
export const NAIROBI_NOTES = [
  "Embakasi Central, East, North and South are shown as one place because the atlas does not hold their governor results separately, so the figures here cannot show any one of them on its own.",
  "A governor candidate does not inherit the votes of the presidential candidate of the same side: at the last election each polled a different number in Nairobi, as the reading on the ticket shows. A name at the top of a ticket is a reason to turn out, not votes a governor candidate can count on.",
  "A second candidate drawn from the same side's voters takes votes from the first candidate, not from the leader. Where the most votes win, the leader gains from every split among the rest.",
  "New registrations are published by county, not by constituency. This screen places them where the estimates put the most adults off the register, which is a guide and not a count.",
];

/**
 * The readings for a plan: where it stands, the votes that would turn it, what
 * a split field does, the closest constituencies, what the new registrations
 * would have to do and what the plan assumes of them, and, from 2022's votes
 * and the estimates, the most the other side could have had, the ticket and the
 * young adults. Each only when there is something to say.
 */
export function outlookLines(o: Outlook, plan: Plan): PathLine[] {
  const seat = o.seat;
  const base = isBaseline(plan, seat);
  const r = simulate(o, plan);
  const names = r.names;
  const A = names[0]!;
  const R = names[r.rival]!;
  const atlas = {
    source: `${seat.source.constituencies}; ${seat.source.county}`,
    period: "August 2022",
  };
  const origin = base ? atlas : MINE;
  const year = figure("Election year", 2022, "2022", atlas);
  const lines: PathLine[] = [];

  // Where the plan stands.
  const l = lean(r.margin);
  {
    const mine = figure("Votes", r.votes[0]!, whole(r.votes[0]!), origin);
    const share = figure(
      "Share of the valid votes",
      r.shares[0]!,
      sharePercent(r.shares[0]!),
      origin,
    );
    const figures: Figure[] = [...(base ? [year] : []), mine, share];
    let verdict = `level with ${R}`;
    if (l.word !== "level") {
      const margin = figure("Votes of margin", r.margin, count(l.n), origin);
      figures.push(margin);
      verdict = `${l.word === "ahead" ? "ahead of" : "behind"} ${R} by ${margin.text} ${plural(l.n, "vote", "votes")}`;
    }
    lines.push({
      id: "standing",
      line: `${base ? `On ${year.text}'s votes` : "With your plan"}, ${A} has ${mine.text} votes, ${share.text} of the valid votes, and is ${verdict}.`,
      figures,
    });
  }

  // The votes that would turn it.
  if (l.word === "level") {
    lines.push({ id: "turn", line: "One vote changing sides would settle it.", figures: [] });
  } else {
    const turn = figure("Votes that would have to change sides", r.toTurn, count(r.toTurn), origin);
    const [from, to] = l.word === "ahead" ? [A, R] : [R, A];
    lines.push({
      id: "turn",
      line: `${turn.text} ${plural(r.toTurn, "vote", "votes")} changing sides from ${from} to ${to} would put ${to} ahead.`,
      figures: [turn],
    });
  }

  // A split field helps whoever leads.
  if (r.top !== null) {
    const top = r.top;
    const others = r.votes.map((_, i) => i).filter((i) => i !== top && Math.round(r.votes[i]!) > 0);
    if (others.length >= 2) {
      const leader = names[top]!;
      const ahead = figure(
        "Votes of the leading candidate",
        r.votes[top]!,
        whole(r.votes[top]!),
        origin,
      );
      const together = sum(others.map((i) => r.votes[i]!));
      const them = figure("Votes of the others together", together, whole(together), origin);
      const who = list(others.map((i) => names[i]!));
      const gap = Math.round(together - r.votes[top]!);
      const figures = [ahead, them];
      let line: string;
      if (gap === 0) {
        line = `${leader} leads with ${ahead.text} votes. ${who} have ${them.text} between them, the same: with one candidate between them they would tie.`;
      } else {
        const g = figure(
          "Votes between the others together and the leader",
          gap,
          count(Math.abs(gap)),
          origin,
        );
        figures.push(g);
        line =
          gap > 0
            ? `${leader} leads with ${ahead.text} votes, but ${who} have ${them.text} between them, ${g.text} more. With one candidate between them they would be ahead; split, ${leader} stays ahead.`
            : `${leader} leads with ${ahead.text} votes. ${who} have ${them.text} between them, ${g.text} fewer: even with one candidate between them they would not catch ${leader}.`;
      }
      lines.push({ id: "united", line, figures });
    }
  }

  // The closest constituencies.
  {
    const near = r.buckets
      .filter((b) => !b.together)
      .map((b) => ({ b, size: sum(b.votes) }))
      .filter(({ b, size }) => size > 0 && Math.abs(b.margin) <= CLOSE * size)
      .sort(
        (x, y) => Math.abs(x.b.margin) - Math.abs(y.b.margin) || x.b.name.localeCompare(y.b.name),
      )
      .slice(0, NEAR);
    if (near.length) {
      const figures: Figure[] = [];
      const parts = near.map(({ b }) => {
        const c = lean(b.margin);
        if (c.n > 0) figures.push(figure(`Margin in ${b.name}`, b.margin, count(c.n), origin));
        return `${b.name} (${short(c)})`;
      });
      lines.push({
        id: "closest",
        line: `The closest ${plural(near.length, "constituency", "constituencies")}: ${list(parts)}.`,
        figures,
      });
    }
  }

  // What the new registrations would have to do, and what the plan assumes of them.
  const reg = o.registration;
  if (reg && reg.count > 0 && seat.total.valid > 0) {
    const off = simulate(o, withBack(plan, "new", 0));
    const m0 = off.votes[0]! - off.votes[off.rival]!;
    const leading = Math.round(m0) > 0;
    const challenger = leading ? names[off.rival]! : A;
    const defender = leading ? A : names[off.rival]!;
    const gap = Math.abs(m0);
    const registered = sum(seat.buckets.map((b) => b.registered));
    const rate = registered > 0 ? seat.total.valid / registered : null;
    /** The share of the new voters' votes the challenger needs to pass when `t` of them vote; null when even all of their votes are too few (equal votes only tie). */
    const need = (t: number) => {
      const people = t * reg.count;
      return people > gap ? (1 + gap / people) / 2 : null;
    };
    const here = { source: reg.source, period: reg.period };
    const n = figure("New registrations in the county", reg.count, count(reg.count), here);
    const ratioValue = reg.count / seat.total.valid;
    const ratio = figure(
      "New registrations against 2022's valid votes",
      ratioValue,
      percent(ratioValue),
      {
        source: `${reg.source}; ${atlas.source}`,
        period: `${reg.period}; ${atlas.period}`,
      },
    );
    const figures: Figure[] = [n, ratio, year];
    const start = `The ${n.text} new registrations are ${ratio.text} of ${year.text}'s valid votes.`;
    const all = need(1);
    let rest: string;
    if (all === null) {
      rest = `Even if all of them voted for ${challenger}, that would not be enough to pass ${defender}.`;
    } else {
      const p1 = figure(
        `Share of the new voters' votes ${challenger} would need if all of them voted`,
        all,
        percent(all),
        MINE,
      );
      figures.push(p1);
      rest = `For ${challenger} to pass ${defender} on them alone, ${challenger} would need about ${p1.text} of their votes if all of them voted`;
      if (rate === null) {
        rest += ".";
      } else {
        const rateF = figure(
          "Share of the register that cast a valid vote in 2022",
          rate,
          percent(rate),
          atlas,
        );
        figures.push(rateF);
        const at = need(rate);
        if (at === null) {
          rest += `, and could not pass ${defender} on them alone if only ${rateF.text} voted, as the register did in ${year.text}.`;
        } else {
          const p2 = figure(
            `Share of the new voters' votes ${challenger} would need at the 2022 rate`,
            at,
            percent(at),
            MINE,
          );
          figures.push(p2);
          rest += `, or about ${p2.text} if ${rateF.text} of them voted, as the register did in ${year.text}.`;
        }
      }
    }
    lines.push({ id: "fresh", line: `${start} ${rest}`, figures });

    const placed = sum(r.buckets.map((b) => b.fresh));
    const back = Math.min(100, Math.max(0, plan.takes.new.back));
    const voting = (placed * back) / 100;
    if (voting > 0) {
      const backF = figure(
        "Share of the new registrations who vote",
        back / 100,
        percent(back / 100),
        MINE,
      );
      const votingF = figure("Votes from the new registrations", voting, whole(voting), MINE);
      const forA = figure(
        `Votes from the new registrations for ${A}`,
        r.from.new[0]!,
        whole(r.from.new[0]!),
        MINE,
      );
      const forR = figure(
        `Votes from the new registrations for ${R}`,
        r.from.new[r.rival]!,
        whole(r.from.new[r.rival]!),
        MINE,
      );
      lines.push({
        id: "fresh-plan",
        line: `In your plan ${backF.text} of the new registrations vote: ${votingF.text} votes, ${forA.text} for ${A} and ${forR.text} for ${R}.`,
        figures: [backF, votingF, forA, forR],
      });
    }
  }

  // On 2022's votes, the most the other side could have had.
  {
    const y = seat.total.yours;
    const v = seat.total.rival;
    if (y !== v) {
      const winner = (y > v ? seat.yours : seat.rival).name;
      const won = Math.max(y, v);
      const against = Math.min(y, v) + seat.others;
      const gap = against - won;
      const had = figure("Votes against the winner", against, count(against), atlas);
      const polled = figure("Votes of the winner", won, count(won), atlas);
      const figures = [year, had, polled];
      const start = `On ${year.text}'s votes, one candidate who took every vote cast against ${winner} would have had ${had.text} votes`;
      let line: string;
      if (gap === 0) {
        line = `${start}, level with the ${polled.text} that ${winner} polled.`;
      } else {
        const g = figure("Votes between them", gap, count(Math.abs(gap)), atlas);
        figures.push(g);
        line =
          gap < 0
            ? `${start}, ${g.text} behind the ${polled.text} that ${winner} polled. The rest would have to come from voters who switch, from new registrations or from people who stayed home.`
            : `${start}, ${g.text} more than the ${polled.text} that ${winner} polled: ${winner} won because those votes were split across the field.`;
      }
      lines.push({ id: "ceiling", line, figures });
    }
  }

  // The ticket: what each governor candidate polled against the presidential candidate of the same side.
  const ticket = seatLines(seat).find((x) => x.id === "ticket");
  if (ticket) lines.push(ticket);

  // The young adults and the adults off the register, as the estimates have them.
  if (o.youth && o.youth.total.adults > 0) {
    const t = o.youth.total;
    const est = { source: o.youth.source, period: String(o.youth.year) };
    const yf = figure("Estimate year", o.youth.year, String(o.youth.year), est);
    const young = figure("Young adults", t.young, count(t.young), est);
    const adults = figure("Adults", t.adults, count(t.adults), est);
    const share = figure(
      "Young adults as a share of adults",
      t.young / t.adults,
      percent(t.young / t.adults),
      est,
    );
    const gap = figure("Adults off the register", t.unregistered, count(t.unregistered), {
      source: `${o.youth.source}; ${seat.source.county}`,
      period: `${o.youth.year}; ${atlas.period}`,
    });
    const reg22 = figure("Register year", 2022, "2022", atlas);
    lines.push({
      id: "young",
      line: `Estimates for ${yf.text} put ${young.text} of ${seat.countyName}'s ${adults.text} adults in the young-adult band (${share.text}), and ${gap.text} adults off the ${reg22.text} register. The estimates are of where people live and the register is of where they registered, so read them as a guide.`,
      figures: [yf, young, adults, share, gap, reg22],
    });
  }

  return lines;
}
