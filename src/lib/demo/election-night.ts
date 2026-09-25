// A simulated election night for the war room demo. Stations, votes and
// report times come from the scenario's area model and a seed, so the same
// scenario always plays out the same way. Minutes count from 17:00, when the
// polls close; the night ends at 06:00.

import { expectedVotes, seeded } from "@/lib/demo/insights";
import type { Scenario } from "@/lib/demo/types";

export const NIGHT_END = 13 * 60;
const VOTERS_PER_STATION = 480;
/** Share of stations where we have no agent: they reach us only through the portal. */
const NO_AGENT = 0.015;
const ADJUDICATE = 0.025;
/**
 * Minutes before a station's form usually reaches us, before travel and
 * network delays. Ballots are counted in order at each station (President,
 * then MP, and Governor fifth), so later races report later.
 */
const COUNT_DELAY: Record<Scenario["office"], number> = { president: 120, mp: 170, governor: 230 };

const SITES = [
  "Primary School",
  "Secondary School",
  "Social Hall",
  "Catholic Church",
  "Chief's Camp",
  "Community Centre",
  "Health Centre",
  "Polytechnic",
  "Market Shed",
  "PCEA Church",
  "ACK Church",
  "Youth Centre",
];

export type NightStation = {
  area: number;
  name: string;
  registered: number;
  /** Valid votes per contender, in the scenario's contender order. */
  votes: number[];
  others: number;
  rejected: number;
  /** Minute our agent's photo of the form arrives; null where we have no agent. */
  reportAt: number | null;
  enteredAt: number;
  verifiedAt: number;
  adjudicated: boolean;
  /** Minute the public portal shows this station. */
  portalAt: number;
  /** What the portal shows minus what the form says, per contender. Zero almost everywhere. */
  portalDelta: number[];
  flag: null | "turnout" | "sum";
  /** Total votes cast as written on the form. */
  stated: number;
};

export type Night = {
  scenario: Scenario;
  stations: NightStation[];
  /** Valid votes the model expected from each area before the night began. */
  expected: number[];
  /** The model's shares per area (0-100), before the night: what the projection starts from. */
  prior: number[][];
};

/** "HH:MM" on election night to minutes after 17:00. */
export function minuteOf(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return ((h ?? 0) * 60 + (m ?? 0) - 17 * 60 + 1440) % 1440;
}

/** Minutes after 17:00 to "HH:MM". */
export function clockOf(minute: number): string {
  const t = (17 * 60 + Math.round(minute)) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function gauss(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);

export function buildNight(s: Scenario): Night {
  const rnd = seeded(s.night.seed);
  const keys = s.contenders.map((c) => c.key);
  const stations: NightStation[] = [];

  s.areas.forEach((a, ai) => {
    const n = Math.max(4, Math.round(a.registered / VOTERS_PER_STATION));
    const base = keys.map((k) => Math.max(0.3, (a.shares[k] ?? 0) + (s.night.swing[k] ?? 0)));
    const othersShare = Math.max(0.4, 100 - sum(base));
    for (let i = 0; i < n; i++) {
      const registered = Math.max(60, Math.round((a.registered / n) * (0.7 + 0.6 * rnd())));
      const turnout = clamp(a.turnout + gauss(rnd) * 0.05, 0.25, 0.96);
      const cast = Math.round(registered * turnout);
      const rejected = Math.round(cast * (0.003 + 0.006 * rnd()));
      const valid = cast - rejected;
      const weights = base.map((v) => v * Math.exp(gauss(rnd) * 0.15));
      const wOthers = othersShare * Math.exp(gauss(rnd) * 0.3);
      const total = sum(weights) + wOthers;
      const votes = weights.map((w) => Math.round((valid * w) / total));
      const others = Math.max(0, valid - sum(votes));
      const noAgent = rnd() < NO_AGENT;
      const arrive = clamp(
        Math.round(COUNT_DELAY[s.office] + a.lag * 60 + 120 * Math.exp(gauss(rnd) * 0.55)),
        40,
        NIGHT_END - 5,
      );
      const enteredAt = arrive + 3 + Math.round(12 * rnd());
      const adjudicated = rnd() < ADJUDICATE;
      const verifiedAt =
        enteredAt + 5 + Math.round(25 * rnd()) + (adjudicated ? 40 + Math.round(80 * rnd()) : 0);
      const round = Math.floor(i / SITES.length);
      stations.push({
        area: ai,
        name: `${a.name} ${SITES[i % SITES.length]}${round > 0 ? ` ${round + 1}` : ""}`,
        registered,
        votes,
        others,
        rejected,
        reportAt: noAgent ? null : arrive,
        enteredAt,
        verifiedAt,
        adjudicated,
        portalAt: clamp(arrive + 25 + Math.round(80 * rnd()), 60, NIGHT_END + 120),
        portalDelta: keys.map(() => 0),
        flag: null,
        stated: cast,
      });
    }
  });

  // A few forms a human has to look at.
  const withAgents = stations.filter((st) => st.reportAt !== null);
  for (let f = 0; f < 4 && withAgents.length > 0; f++) {
    const st = withAgents[Math.floor(rnd() * withAgents.length)]!;
    if (st.flag) continue;
    if (f % 2 === 0) {
      // More votes than voters on the register (here in the main rival's column).
      const extra = Math.round(st.registered * 1.04) - (sum(st.votes) + st.others + st.rejected);
      st.votes[1] = (st.votes[1] ?? 0) + Math.max(extra, 5);
      st.stated = sum(st.votes) + st.others + st.rejected;
      st.flag = "turnout";
    } else {
      // The stated total and the sum of the candidates' votes disagree.
      st.stated += 23 + Math.round(rnd() * 40);
      st.flag = "sum";
    }
  }

  // The one place the portal and our forms disagree.
  const div = s.night.divergence;
  const divAt = minuteOf(div.at);
  const divArea = s.areas.findIndex((a) => a.name === div.area || a.group === div.area);
  const candidates = stations.filter(
    (st) => st.area === divArea && st.reportAt !== null && st.reportAt < divAt - 20,
  );
  const count = Math.min(
    s.office === "president" ? 3 : s.office === "governor" ? 2 : 1,
    candidates.length,
  );
  for (let d = 0; d < count; d++) {
    const st = candidates[Math.floor((d + 0.5) * (candidates.length / count))]!;
    st.portalAt = divAt;
    // Our candidate is short on the portal, or the main rival is over.
    if (s.office === "president") st.portalDelta[0] = -Math.round(1204 / count);
    else st.portalDelta[1] = Math.round((s.office === "governor" ? 318 : 96) / count);
  }

  const prior = s.areas.map((a) => keys.map((k) => a.shares[k] ?? 0));
  return { scenario: s, stations, expected: s.areas.map((a) => expectedVotes(a)), prior };
}

export type Call = {
  state: "early" | "close" | "leaning" | "called" | "runoff";
  /** Contender index, when there is one. */
  who: number | null;
  text: string;
};

export type AreaFrame = {
  slug: string;
  name: string;
  group: string;
  /** Share of this area's stations in, 0-100. */
  reported: number;
  /** Counted shares so far, per contender (0-100). */
  shares: number[];
  leader: number | null;
  /** Our lead over the best rival, in points, on counted votes. */
  margin: number;
  /** Our counted share against our side's 2022 share; null until results arrive. */
  swing: number | null;
  /** Our projected share for the whole area. */
  projectedUs: number;
};

export type NightFrame = {
  minute: number;
  clock: string;
  stations: {
    total: number;
    reported: number;
    entered: number;
    verified: number;
    adjudicating: number;
    blind: number;
  };
  registered: number;
  registeredCovered: number;
  votes: number[];
  others: number;
  valid: number;
  shares: number[];
  othersShare: number;
  turnout: { now: number; then: number };
  projection: { shares: number[]; band: number; margin: number; marginBand: number };
  call: Call;
  areas: AreaFrame[];
  /** President only: areas where our projected share is at least 25%. */
  at25: number | null;
  portal: {
    reported: number;
    shares: number[];
    mismatches: number;
    mismatchVotes: number;
    alert: string | null;
  };
  feed: { at: string; station: string; area: string; votes: number[] }[];
  incidents: Scenario["night"]["incidents"];
  flags: { at: string; title: string; station: string; area: string }[];
};

export function frameAt(night: Night, minute: number): NightFrame {
  const s = night.scenario;
  const k = s.contenders.length;
  const nA = s.areas.length;
  const obs = s.areas.map(() => new Array<number>(k).fill(0));
  const obsValid = new Array<number>(nA).fill(0);
  const regIn = new Array<number>(nA).fill(0);
  const regAll = new Array<number>(nA).fill(0);
  const stIn = new Array<number>(nA).fill(0);
  const stAll = new Array<number>(nA).fill(0);
  const portalVotes = new Array<number>(k).fill(0);
  let portalValid = 0;
  let portalIn = 0;
  let mismatches = 0;
  let mismatchVotes = 0;
  let reported = 0;
  let entered = 0;
  let verified = 0;
  let adjudicating = 0;
  let blind = 0;
  let others = 0;
  let castIn = 0;
  let then = 0;
  const feed: { st: NightStation; at: number }[] = [];
  const flags: NightFrame["flags"] = [];

  for (const st of night.stations) {
    const a = st.area;
    regAll[a]! += st.registered;
    stAll[a]! += 1;
    if (st.reportAt === null) blind++;
    const valid = sum(st.votes) + st.others;
    if (st.portalAt <= minute) {
      portalIn++;
      for (let c = 0; c < k; c++) portalVotes[c]! += (st.votes[c] ?? 0) + (st.portalDelta[c] ?? 0);
      portalValid += valid + sum(st.portalDelta);
      if (st.reportAt !== null && st.reportAt <= minute && st.portalDelta.some((d) => d !== 0)) {
        mismatches++;
        mismatchVotes += st.portalDelta.reduce((x, y) => x + Math.abs(y), 0);
      }
    }
    if (st.reportAt === null || st.reportAt > minute) continue;
    reported++;
    if (st.enteredAt <= minute) entered++;
    if (st.verifiedAt <= minute) verified++;
    else if (st.adjudicated && st.enteredAt <= minute) adjudicating++;
    regIn[a]! += st.registered;
    stIn[a]! += 1;
    for (let c = 0; c < k; c++) obs[a]![c]! += st.votes[c] ?? 0;
    obsValid[a]! += valid;
    others += st.others;
    castIn += st.stated;
    then += st.registered * (s.areas[a]?.turnout2022 ?? 0);
    feed.push({ st, at: st.reportAt });
    if (st.flag) {
      flags.push({
        at: clockOf(st.reportAt),
        title:
          st.flag === "turnout"
            ? `Turnout above the register · ${Math.round((st.stated / st.registered) * 100)}%`
            : "Candidates' votes don't add up to the stated total",
        station: st.name,
        area: s.areas[a]?.name ?? "",
      });
    }
  }

  const votes = new Array<number>(k).fill(0);
  for (let a = 0; a < nA; a++) for (let c = 0; c < k; c++) votes[c]! += obs[a]![c]!;
  const valid = sum(votes) + others;
  const registered = sum(regAll);
  const registeredCovered = sum(regIn);
  const coverage = registered ? registeredCovered / registered : 0;

  // How counted areas are running against the model, applied to the areas still out.
  const swing = new Array<number>(k).fill(0);
  const counted = sum(obsValid);
  if (counted > 0) {
    for (let a = 0; a < nA; a++) {
      const v = obsValid[a]!;
      if (!v) continue;
      for (let c = 0; c < k; c++) {
        swing[c]! += (v * ((obs[a]![c]! / v) * 100 - night.prior[a]![c]!)) / counted;
      }
    }
  }
  const trust = Math.min(1, coverage / 0.25);

  const projVotes = new Array<number>(k).fill(0);
  let projTotal = 0;
  let variance = 0;
  let remainingTotal = 0;
  const projUs = new Array<number>(nA).fill(0);
  for (let a = 0; a < nA; a++) {
    const cov = regAll[a] ? regIn[a]! / regAll[a]! : 0;
    const remaining = (1 - cov) * night.expected[a]!;
    const w = Math.sqrt(cov);
    const v = obsValid[a]!;
    let areaUs = 0;
    for (let c = 0; c < k; c++) {
      const prior = night.prior[a]![c]! + swing[c]! * trust;
      const seen = v ? (obs[a]![c]! / v) * 100 : prior;
      const est = w * seen + (1 - w) * prior;
      const pv = obs[a]![c]! + (remaining * est) / 100;
      projVotes[c]! += pv;
      if (c === 0) areaUs = pv;
    }
    const areaTotal = v + remaining;
    projUs[a] = areaTotal ? (areaUs / areaTotal) * 100 : 0;
    projTotal += areaTotal;
    remainingTotal += remaining;
    const sigma = 0.045 * (1 - cov) + 0.004;
    variance += (remaining * sigma) ** 2;
  }
  // Areas out so far may all lean the same way: a shared error that only counting removes.
  variance += (0.03 * remainingTotal) ** 2;
  const projShares = projVotes.map((v) => (projTotal ? (v / projTotal) * 100 : 0));
  const band = Math.max(0.15, projTotal ? (196 * Math.sqrt(variance)) / projTotal : 5);
  let rivalIdx = 1;
  for (let c = 2; c < k; c++) if (projShares[c]! > projShares[rivalIdx]!) rivalIdx = c;
  const margin = (projShares[0] ?? 0) - (projShares[rivalIdx] ?? 0);
  const marginBand = band * 2;
  const reportedPct = night.stations.length ? (reported / night.stations.length) * 100 : 0;

  const at25 = s.office === "president" ? projUs.filter((p) => p >= 25).length : null;
  const call = decide(s, projShares, band, margin, marginBand, reportedPct, at25, rivalIdx);

  const areas: AreaFrame[] = s.areas.map((area, a) => {
    const v = obsValid[a]!;
    const shares = obs[a]!.map((x) => (v ? (x / v) * 100 : 0));
    let leader: number | null = null;
    if (v) {
      leader = 0;
      for (let c = 1; c < k; c++) if (shares[c]! > shares[leader]!) leader = c;
    }
    return {
      slug: area.slug,
      name: area.name,
      group: area.group,
      reported: stAll[a] ? (stIn[a]! / stAll[a]!) * 100 : 0,
      shares,
      leader,
      margin: v ? (shares[0] ?? 0) - Math.max(...shares.slice(1)) : 0,
      swing: v ? (shares[0] ?? 0) - area.us2022 : null,
      projectedUs: projUs[a]!,
    };
  });

  feed.sort((x, y) => y.at - x.at);

  return {
    minute,
    clock: clockOf(minute),
    stations: { total: night.stations.length, reported, entered, verified, adjudicating, blind },
    registered,
    registeredCovered,
    votes,
    others,
    valid,
    shares: votes.map((v) => (valid ? (v / valid) * 100 : 0)),
    othersShare: valid ? (others / valid) * 100 : 0,
    turnout: {
      now: registeredCovered ? (castIn / registeredCovered) * 100 : 0,
      then: registeredCovered ? (then / registeredCovered) * 100 : 0,
    },
    projection: { shares: projShares, band, margin, marginBand },
    call,
    areas,
    at25,
    portal: {
      reported: night.stations.length ? (portalIn / night.stations.length) * 100 : 0,
      shares: portalVotes.map((v) => (portalValid ? (v / portalValid) * 100 : 0)),
      mismatches,
      mismatchVotes,
      alert: mismatches > 0 ? s.night.divergence.detail : null,
    },
    feed: feed.slice(0, 8).map(({ st, at }) => ({
      at: clockOf(at),
      station: st.name,
      area: s.areas[st.area]?.name ?? "",
      votes: st.votes,
    })),
    incidents: s.night.incidents.filter((i) => minuteOf(i.at) <= minute),
    flags: flags.sort((x, y) => (x.at < y.at ? 1 : -1)),
  };
}

function decide(
  s: Scenario,
  shares: number[],
  band: number,
  margin: number,
  marginBand: number,
  reportedPct: number,
  at25: number | null,
  rival: number,
): Call {
  const name = (i: number) => s.contenders[i]?.name ?? "";
  if (reportedPct < 5) {
    return {
      state: "early",
      who: null,
      text: `Too early to say: ${reportedPct.toFixed(1)}% of stations in.`,
    };
  }
  if (s.office === "president") {
    const us = shares[0] ?? 0;
    const them = shares[rival] ?? 0;
    if (reportedPct >= 40 && us - band > 50 && (at25 ?? 0) >= 24) {
      return {
        state: "called",
        who: 0,
        text: `Projected: ${name(0)} above 50% (${us.toFixed(1)} ± ${band.toFixed(1)}) and at 25% or more in ${at25} counties.`,
      };
    }
    if (reportedPct >= 40 && them - band > 50) {
      return { state: "called", who: rival, text: `Projected: ${name(rival)} above 50%.` };
    }
    if (reportedPct >= 60 && us + band < 50 && them + band < 50) {
      return {
        state: "runoff",
        who: null,
        text: "Projected: nobody above 50%. A run-off between the top two.",
      };
    }
    const lead = us >= them ? 0 : rival;
    if (Math.abs(us - them) > band) {
      return {
        state: "leaning",
        who: lead,
        text: `Leaning ${name(lead)}; the 50% line is still inside the range.`,
      };
    }
    return { state: "close", who: null, text: "Too close to call." };
  }
  if (reportedPct >= 30 && margin - marginBand > 0) {
    return {
      state: "called",
      who: 0,
      text: `Projected: ${name(0)} wins by ${margin.toFixed(1)} ± ${marginBand.toFixed(1)} points.`,
    };
  }
  if (reportedPct >= 30 && margin + marginBand < 0) {
    return { state: "called", who: rival, text: `Projected: ${name(rival)} wins.` };
  }
  if (Math.abs(margin) > marginBand / 2) {
    const lead = margin > 0 ? 0 : rival;
    return { state: "leaning", who: lead, text: `Leaning ${name(lead)}, inside the range.` };
  }
  return { state: "close", who: null, text: "Too close to call." };
}
