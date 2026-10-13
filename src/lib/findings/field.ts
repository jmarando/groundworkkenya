// The rules for field work and money: where votes can move, wards whose doors
// lag, wards short of their supporter targets, adults not yet registered, and
// stipend spend out of line with where the voters are. Pure.

import { TODO_NAMES } from "@/lib/atlas";
import { topMoves } from "@/lib/atlas-app";
import { electionOf, figuresFor, sourceAt } from "@/lib/atlas-view";
import {
  count,
  finding,
  LIMITS,
  percent,
  topPart,
  within,
  type Finding,
  type FindingsInput,
  type FindingsWard,
} from "@/lib/findings/core";

/** The campaign's wards the atlas holds, with their 2022 registered voters. */
function registered(i: FindingsInput): { w: FindingsWard; key: string; reg: number }[] {
  return i.wards.flatMap((w) => {
    const reg = w.key ? figuresFor(i.atlas, w.key, i.race, 2022).registered : null;
    return w.key && reg ? [{ w, key: w.key, reg }] : [];
  });
}

const days30 = (i: FindingsInput, source: string) => ({
  label: "Days",
  value: 30,
  text: "30",
  source,
  period: `30 days to ${i.today}`,
});

/** 6. Every seat to weigh, with what to do there, why, and the votes within reach. */
export function votesWithinReach(i: FindingsInput): Finding[] {
  return topMoves(i.atlas, i.home, i.race, Infinity).map((f) => {
    const reach = f.reach!;
    const todo = f.todo!;
    const src = sourceAt(i.atlas, electionOf(i.race, 2022), f.key)?.publisher ?? "IEBC";
    return finding(
      "votes-within-reach",
      f.key,
      `${f.name}: ${TODO_NAMES[todo.todo]}. ${todo.reason} ${reach.partial ? "At least" : "About"} ${count(reach.total)} votes within reach.`,
      [
        ...todo.figures.map((x) => ({ ...x, source: src, period: "2022" })),
        {
          label: "Votes within reach",
          value: reach.total,
          text: count(reach.total),
          source: `Worked out from ${src} results`,
          period: "2022",
        },
      ],
      { label: "Open in Elections", to: "/elections", search: { area: f.key } },
      reach.total,
    );
  });
}

/** 7. Wards in the bottom quarter for doors knocked and the top half for voters; or, with few doors, the campaign. */
export function doorsBehind(i: FindingsInput): Finding[] {
  if (!i.houses || !i.doors) return [];
  const knocked = new Map(i.doors.map((d) => [d.wardId, d.knocked]));
  const total = i.doors.reduce((t, d) => t + d.knocked, 0);
  if (total < LIMITS.doorsCampaignMin) {
    return [
      finding(
        "doors-behind",
        null,
        `${count(total)} houses knocked across your ${count(i.wards.length)} wards in the last 30 days.`,
        [
          {
            label: "Houses knocked",
            value: total,
            text: count(total),
            source: "Your door visits",
            period: `30 days to ${i.today}`,
          },
          {
            label: "Your wards",
            value: i.wards.length,
            text: count(i.wards.length),
            source: "Your wards",
            period: i.today,
          },
          days30(i, "Your door visits"),
        ],
        { label: "Open the Voters map", to: "/voters" },
        0,
      ),
    ];
  }
  const rows = registered(i).flatMap((r) => {
    const houses = i.houses![r.w.slug] ?? 0;
    return houses > 0 ? [{ ...r, houses, knocked: knocked.get(r.w.id) ?? 0 }] : [];
  });
  const cover = (r: (typeof rows)[number]) => r.knocked / r.houses;
  const low = new Set(
    topPart(
      rows,
      (r) => -cover(r),
      0.25,
      (r) => r.key,
    ).map((r) => r.key),
  );
  const big = new Set(
    topPart(
      rows,
      (r) => r.reg,
      0.5,
      (r) => r.key,
    ).map((r) => r.key),
  );
  return rows
    .filter((r) => low.has(r.key) && big.has(r.key))
    .map((r) =>
      finding(
        "doors-behind",
        r.key,
        `${r.w.name}: ${percent(cover(r))} of its ${count(r.houses)} houses knocked in 30 days, with ${count(r.reg)} registered voters.`,
        [
          {
            label: "Houses knocked",
            value: cover(r),
            text: percent(cover(r)),
            source: "Your door visits",
            period: `30 days to ${i.today}`,
          },
          {
            label: "Houses in the ward",
            value: r.houses,
            text: count(r.houses),
            source: "Google Open Buildings v3",
            period: "2023",
          },
          {
            label: "Houses knocked, in number",
            value: r.knocked,
            text: count(r.knocked),
            source: "Your door visits",
            period: `30 days to ${i.today}`,
          },
          {
            label: "Registered voters",
            value: r.reg,
            text: count(r.reg),
            source: "IEBC",
            period: "2022",
          },
          days30(i, "Your door visits"),
        ],
        { label: "Open the ward on the map", to: "/voters", search: { area: `w:${r.w.slug}` } },
        r.reg,
      ),
    );
}

/** 8. Wards whose supporters fall short of the team's target. */
export function shortOfTarget(i: FindingsInput): Finding[] {
  if (!i.supporters) return [];
  const have = new Map(i.supporters.map((s) => [s.wardId, s.supporters]));
  return i.wards.flatMap((w) => {
    const target = w.targetVotes ?? 0;
    const found = have.get(w.id) ?? 0;
    const gap = target - found;
    if (!w.key || target <= 0 || gap <= 0) return [];
    return [
      finding(
        "short-of-target",
        w.key,
        `${w.name}: ${count(found)} supporters found of a ${count(target)} target, ${count(gap)} short.`,
        [
          {
            label: "Supporters found",
            value: found,
            text: count(found),
            source: "Your contacts who agreed to SMS",
            period: i.today,
          },
          {
            label: "Target",
            value: target,
            text: count(target),
            source: "Your team's ward targets",
            period: i.today,
          },
          {
            label: "Short",
            value: gap,
            text: count(gap),
            source: "Your team's ward targets",
            period: i.today,
          },
        ],
        {
          label: "See the ward's people",
          to: "/voters",
          search: { area: `w:${w.slug}`, tab: "people" },
        },
        gap,
      ),
    ];
  });
}

/** 9. Wards where WorldPop's adults outnumber the register by 5,000 or a fifth. */
export function unregisteredAdults(i: FindingsInput): Finding[] {
  return i.atlas.areas
    .filter((a) => a.level === "ward" && within(i.home, a.key))
    .flatMap((a) => {
      const f = figuresFor(i.atlas, a.key, i.race, 2022);
      const gap = f.notRegistered?.adults ?? 0;
      const adults = f.population?.adults ?? 0;
      if (!gap || !adults || f.registered === null) return [];
      if (gap < LIMITS.unregisteredMin && gap / adults < LIMITS.unregisteredShare) return [];
      const about = Math.round(gap / 100) * 100;
      const year = String(f.population!.year);
      return [
        finding(
          "unregistered-adults",
          a.key,
          `${a.name}: about ${count(about)} adults aren't registered (estimate), a registration drive opportunity.`,
          [
            {
              label: "Adults not registered, to the nearest 100",
              value: about,
              text: count(about),
              source: "WorldPop's estimate less IEBC's register",
              period: `${year} and 2022`,
            },
            {
              label: "Adults",
              value: adults,
              text: count(adults),
              source: "WorldPop estimate",
              period: year,
            },
            {
              label: "Registered voters",
              value: f.registered,
              text: count(f.registered),
              source: "IEBC",
              period: "2022",
            },
          ],
          { label: "Open in Elections", to: "/elections", search: { area: a.key } },
          gap,
        ),
      ];
    });
}

/** 10. Bigger wards getting under half their share of the campaign's stipend spend. */
export function spendOutOfLine(i: FindingsInput): Finding[] {
  if (!i.spend) return [];
  const spent = i.spend.reduce((t, s) => t + s.kes, 0);
  if (spent < LIMITS.spendMinKes) return [];
  const kes = new Map(i.spend.map((s) => [s.wardId, s.kes]));
  const rows = registered(i);
  const voters = rows.reduce((t, r) => t + r.reg, 0);
  if (!voters) return [];
  return topPart(
    rows,
    (r) => r.reg,
    0.5,
    (r) => r.key,
  ).flatMap((r) => {
    const voterShare = r.reg / voters;
    const mine = kes.get(r.w.id) ?? 0;
    const spendShare = mine / spent;
    if (spendShare >= LIMITS.spendOfVoterShare * voterShare) return [];
    return [
      finding(
        "spend-out-of-line",
        r.key,
        `${r.w.name}: ${percent(spendShare)} of stipend spend in 30 days, for ${percent(voterShare)} of your registered voters.`,
        [
          {
            label: "Share of stipend spend",
            value: spendShare,
            text: percent(spendShare),
            source: "Your stipend records",
            period: `30 days to ${i.today}`,
          },
          {
            label: "Share of your registered voters",
            value: voterShare,
            text: percent(voterShare),
            source: "IEBC",
            period: "2022",
          },
          {
            label: "Stipends in the ward, KES",
            value: mine,
            text: count(mine),
            source: "Your stipend records",
            period: `30 days to ${i.today}`,
          },
          days30(i, "Your stipend records"),
        ],
        { label: "Open Agents & stipends", to: "/agents" },
        voterShare - spendShare,
      ),
    ];
  });
}
