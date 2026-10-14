// The rules for the candidate's time: places that matter with no stop in the
// diary, and stops spent where the votes are already ours. Pure.

import { electionOf, figuresFor, type AreaFigures } from "@/lib/atlas-view";
import { addDays } from "@/lib/diary";
import {
  count,
  finding,
  levelOf,
  LIMITS,
  percent,
  seatsOf,
  topPart,
  within,
  type Figure,
  type Finding,
  type FindingsInput,
  type FindingsWard,
} from "@/lib/findings/core";

const TO_WIN = ["persuade", "cut", "mobilise"];
const SAFE = ["hold", "lean-ours"];

/** The atlas keys of the diary's stops from `from` to `to`: entries with a ward, "To watch" aside. */
function stopKeys(i: FindingsInput, from: string, to: string): string[] {
  const keyOf = new Map(i.wards.map((w) => [w.id, w.key]));
  return i.diary
    .filter((e) => e.kind !== "watch" && e.wardId && e.day >= from && e.day <= to)
    .flatMap((e) => keyOf.get(e.wardId!) ?? []);
}

/** The seats with a 2022 count for the campaign's race, once its side is set. */
function seatFigures(i: FindingsInput): AreaFigures[] {
  if (!i.atlas.sides[electionOf(i.race, 2022)]) return [];
  return seatsOf(i)
    .map((k) => figuresFor(i.atlas, k, i.race, 2022))
    .filter((f) => f.reach !== null && f.todo !== null && f.todo.todo !== "no-side");
}

/** The campaign's ward inside `place` with the most registered voters. */
function biggestWard(i: FindingsInput, place: string): FindingsWard | null {
  const inside = i.wards.flatMap((w) => {
    const reg =
      w.key && within(place, w.key) ? figuresFor(i.atlas, w.key, i.race, 2022).registered : null;
    return reg ? [{ w, reg }] : [];
  });
  return (
    topPart(
      inside,
      (x) => x.reg,
      1,
      (x) => x.w.id,
    )[0]?.w ?? null
  );
}

const looked = (i: FindingsInput): Figure => ({
  label: "Days of the diary looked back",
  value: LIMITS.daysBack,
  text: String(LIMITS.daysBack),
  source: "Your diary",
  period: `${LIMITS.daysBack} days back and ${LIMITS.daysAhead} ahead of ${i.today}`,
});

const visit = (w: FindingsWard | null) =>
  w
    ? { label: "Plan a visit", to: "/diary", search: { add: w.id } }
    : { label: "Open the diary", to: "/diary" };

/** 1. A place that matters with no stop in the last 60 days and none in the next 14. */
export function notVisited(i: FindingsInput): Finding[] {
  const stops = stopKeys(i, addDays(i.today, -LIMITS.daysBack), addDays(i.today, LIMITS.daysAhead));
  const visited = (place: string) => stops.some((k) => within(place, k));
  if (levelOf(i) === "constituency") {
    // An MP: the bigger half of the campaign's wards, by registered voters.
    const wards = i.wards.flatMap((w) => {
      const reg = w.key ? figuresFor(i.atlas, w.key, i.race, 2022).registered : null;
      return w.key && reg ? [{ w, key: w.key, reg }] : [];
    });
    return topPart(
      wards,
      (x) => x.reg,
      0.5,
      (x) => x.key,
    )
      .filter((x) => !visited(x.key))
      .map((x) =>
        finding(
          "not-visited",
          x.key,
          `${x.w.name}: no diary stop in the last ${LIMITS.daysBack} days and none planned, with ${count(x.reg)} registered voters.`,
          [
            looked(i),
            {
              label: "Registered voters",
              value: x.reg,
              text: count(x.reg),
              source: "IEBC",
              period: "2022",
            },
          ],
          visit(x.w),
          x.reg,
        ),
      );
  }
  // Governor or president: the top quarter of the seats to win, by votes within reach.
  const seats = seatFigures(i).filter((f) => TO_WIN.includes(f.todo!.todo));
  return topPart(
    seats,
    (f) => f.reach!.total,
    0.25,
    (f) => f.key,
  )
    .filter((f) => !visited(f.key))
    .map((f) => {
      const reach = f.reach!;
      return finding(
        "not-visited",
        f.key,
        `${f.name}: no diary stop in the last ${LIMITS.daysBack} days and none planned, with ${reach.partial ? "at least" : "about"} ${count(reach.total)} votes within reach.`,
        [
          looked(i),
          {
            label: "Votes within reach",
            value: reach.total,
            text: count(reach.total),
            source: "Worked out from IEBC results",
            period: "2022",
          },
        ],
        visit(biggestWard(i, f.key)),
        reach.total,
      );
    });
}

/** 2. Most of the candidate's stops in seats already ours, which hold few of the votes within reach. */
export function timeInSafeSeats(i: FindingsInput): Finding[] {
  if (levelOf(i) === "constituency") return [];
  const seats = seatFigures(i);
  const stops = stopKeys(
    i,
    addDays(i.today, -LIMITS.safeDaysBack),
    addDays(i.today, LIMITS.daysAhead),
  ).flatMap((k) => seats.find((s) => within(s.key, k)) ?? []);
  if (stops.length < LIMITS.safeMinStops) return [];
  const safe = (f: AreaFigures) => SAFE.includes(f.todo!.todo);
  const inSafe = stops.filter(safe).length;
  const reach = seats.reduce((t, f) => t + f.reach!.total, 0);
  const reachSafe = seats.filter(safe).reduce((t, f) => t + f.reach!.total, 0);
  const stopShare = inSafe / stops.length;
  const reachShare = reach ? reachSafe / reach : 0;
  if (stopShare < LIMITS.safeStopShare || reachShare >= LIMITS.safeReachShare) return [];
  const period = `${LIMITS.safeDaysBack} days back and ${LIMITS.daysAhead} ahead of ${i.today}`;
  return [
    finding(
      "time-in-safe-seats",
      null,
      `${inSafe} of your ${stops.length} stops (last ${LIMITS.safeDaysBack} days and next ${LIMITS.daysAhead}) are in Hold or Lean ours seats, which hold ${percent(reachShare)} of the votes within reach.`,
      [
        {
          label: "Stops in Hold or Lean ours seats",
          value: inSafe,
          text: String(inSafe),
          source: "Your diary",
          period,
        },
        {
          label: "Stops in all",
          value: stops.length,
          text: String(stops.length),
          source: "Your diary",
          period,
        },
        {
          label: "Days back",
          value: LIMITS.safeDaysBack,
          text: String(LIMITS.safeDaysBack),
          source: "Your diary",
          period,
        },
        {
          label: "Days ahead",
          value: LIMITS.daysAhead,
          text: String(LIMITS.daysAhead),
          source: "Your diary",
          period,
        },
        {
          label: "Their share of the votes within reach",
          value: reachShare,
          text: percent(reachShare),
          source: "Worked out from IEBC results",
          period: "2022",
        },
      ],
      { label: "Open the diary", to: "/diary" },
      stopShare,
    ),
  ];
}
