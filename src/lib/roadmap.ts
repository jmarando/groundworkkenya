// The road to election day: the campaign's plan from today to polling day in phases, each phase's
// milestones under a workstream, and the gaps the campaign's own records show. Pure. The starting
// plan (baseRoadmap) is worked out here from IEBC's dates and the gaps, every figure a count of
// the records it names; a draft the AI writes from the same gaps is stored (campaign_roadmaps,
// schema 39) and read here without trust. Places, never people.

import type { Source } from "@/lib/brief";
import { readSources } from "@/lib/brief";
import { daysUntil, ELECTION_DAY, keyDates, seatDates } from "@/lib/election-calendar";
import { addDays } from "@/lib/nairobi-date";

export const WORKSTREAMS = [
  { key: "registration", name: "Voter registration" },
  { key: "agents", name: "Agents" },
  { key: "field", name: "Doors and field team" },
  { key: "rallies", name: "Rallies and appearances" },
  { key: "coalition", name: "Party, primary and allies" },
  { key: "message", name: "Message and media" },
  { key: "digital", name: "Digital and youth" },
  { key: "money", name: "Money" },
  { key: "rivals", name: "Rivals" },
] as const;
export type Workstream = (typeof WORKSTREAMS)[number]["key"];
const STREAM_KEYS = WORKSTREAMS.map((w) => w.key) as Workstream[];
export const streamName = (k: string) => WORKSTREAMS.find((w) => w.key === k)?.name ?? "The plan";

export const PHASE_KEYS = ["build", "primaries", "ticket", "campaign", "polling"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export type Milestone = {
  /** Stable across drafts, so progress carries over: phase-workstream-word. */
  key: string;
  workstream: Workstream;
  title: string;
  why: string;
  how: string[];
  by: string | null;
  measure: string | null;
};
export type Phase = {
  key: PhaseKey;
  title: string;
  from: string;
  to: string;
  focus: string;
  milestones: Milestone[];
};
export type Roadmap = {
  id: string | null;
  headline: string;
  summary: string;
  phases: Phase[];
  writtenBy: string | null;
  createdAt: string | null;
};

/** What the records say, counted for the campaign. Null where it can't be read. */
export type Figures = {
  level: string;
  stations: number;
  streams: number;
  staffed: number;
  registered: number;
  target: number;
  supporters: number | null;
  reachable: number | null;
  doors: number | null;
  raised: number | null;
  spent: number | null;
  limit: number | null;
  appearances30: number | null;
};

export type Gap = {
  workstream: Workstream;
  key: string;
  tone: "urgent" | "watch" | "good";
  headline: string;
  why: string;
};

const nf = (n: number) => Math.round(n).toLocaleString("en-KE");
const pct = (n: number) => `${Math.round(n * 100)}%`;
const weeks = (today: string, day: string) => Math.max(1, Math.ceil(daysUntil(today, day) / 7));

/** The phases from today to the week after polling day, for this seat. */
export function phasesFor(level: string, today: string): Omit<Phase, "milestones">[] {
  const start = seatDates(level).campaign;
  const all: Omit<Phase, "milestones">[] = [
    {
      key: "build",
      title: "Build the machine",
      from: today,
      to: "2027-02-10",
      focus:
        "Before anyone may campaign openly: register supporters, name a coordinator for every ward and polling centre, raise the money, and fix the party route.",
    },
    {
      key: "primaries",
      title: "Win the ticket",
      from: "2027-02-11",
      to: "2027-05-08",
      focus:
        "Supporters on the party's membership list by 16 March, then the primary won and any dispute settled by 8 May.",
    },
    {
      key: "ticket",
      title: "Nominated and ready",
      from: "2027-05-09",
      to: addDays(start, -1),
      focus:
        "Papers to IEBC on your seat's day, supporters checking their names on the register, and the whole campaign ready to open on the first lawful day.",
    },
    {
      key: "campaign",
      title: "The campaign",
      from: start,
      to: "2027-08-07",
      focus:
        "Every lawful day out among voters, every ward walked twice, every agent named by 27 July.",
    },
    {
      key: "polling",
      title: "Polling and the count",
      from: "2027-08-08",
      to: addDays(ELECTION_DAY, 7),
      focus:
        "Turnout on the day, an agent at every stream, every Form 34A photographed and checked.",
    },
  ];
  return all
    .filter((p) => p.to >= today)
    .map((p) => ({ ...p, from: p.from < today ? today : p.from }));
}

/** The gaps the records show, most pressing first. Every number is a count of named records. */
export function gaps(f: Figures, today: string): Gap[] {
  const out: Gap[] = [];
  const need = Math.max(f.streams, f.stations);
  if (need > 0) {
    const missing = Math.max(0, need - f.staffed);
    const perWeek = Math.ceil(missing / weeks(today, "2027-07-27"));
    out.push({
      workstream: "agents",
      key: "agents",
      tone: f.staffed === 0 ? "urgent" : missing / need > 0.5 ? "watch" : "good",
      headline: `${nf(f.staffed)} of ${nf(need)} polling ${f.streams > f.stations ? "streams" : "centres"} have an agent named`,
      why: missing
        ? `${nf(missing)} still to find: about ${nf(perWeek)} a week until IEBC's 27 July 2027 deadline, plus a reserve for those who drop out.`
        : "Every one has an agent. Keep a reserve and train them on Form 34A.",
    });
  }
  if (f.registered > 0 && f.target > 0) {
    const share = f.target / f.registered;
    out.push({
      workstream: "registration",
      key: "registration",
      tone: share > 0.45 ? "urgent" : share > 0.35 ? "watch" : "good",
      headline: `The vote target is ${pct(share)} of the ${nf(f.registered)} registered`,
      why:
        share > 0.45
          ? "Too much to win from today's register alone at a normal turnout: register new supporters, above all first-time voters, before registration stops about 11 June 2027."
          : "Within reach of today's register; registration still adds supporters, and turnout decides it.",
    });
  }
  if (f.supporters !== null && f.target > 0) {
    const missing = Math.max(0, f.target - f.supporters);
    out.push({
      workstream: "field",
      key: "supporters",
      tone:
        f.supporters < f.target * 0.05
          ? "urgent"
          : f.supporters < f.target * 0.3
            ? "watch"
            : "good",
      headline: `${nf(f.supporters)} supporters on file who agreed to hear from you, against a target of ${nf(f.target)} votes`,
      why: missing
        ? `About ${nf(missing / weeks(today, ELECTION_DAY))} more a week to have the target's worth of named supporters by polling day.`
        : "The list matches the target. Now make sure they are registered and turn out.",
    });
  }
  if (f.doors !== null) {
    out.push({
      workstream: "field",
      key: "doors",
      tone: f.doors === 0 ? "urgent" : "watch",
      headline: `${nf(f.doors)} doors knocked so far`,
      why:
        f.doors === 0
          ? "No door has been recorded. The field plan puts walk lists on days and in hands."
          : "From the walk lists' door records. Every ward walked twice before polling day is the aim.",
    });
  }
  if (f.appearances30 !== null) {
    out.push({
      workstream: "rallies",
      key: "appearances",
      tone: f.appearances30 < 8 ? "urgent" : f.appearances30 < 16 ? "watch" : "good",
      headline: `${nf(f.appearances30)} public appearances in the diary for the next 30 days`,
      why: "Markets, churches, funerals, meetings and media. Before 29 May they are visits, not rallies: campaigning openly comes only with the campaign period.",
    });
  }
  if (f.reachable !== null && f.supporters !== null && f.supporters > 0) {
    out.push({
      workstream: "digital",
      key: "reachable",
      tone: f.reachable < f.supporters * 0.5 ? "watch" : "good",
      headline: `${nf(f.reachable)} people can be messaged by SMS or WhatsApp`,
      why: "Only those who said yes and haven't opted out. Every door and event should ask.",
    });
  }
  if (f.spent !== null) {
    if (f.limit) {
      const used = f.spent / f.limit;
      const elapsed = 1 - daysUntil(today, ELECTION_DAY) / daysUntil("2026-08-07", ELECTION_DAY);
      out.push({
        workstream: "money",
        key: "limit",
        tone: used > elapsed + 0.1 ? "urgent" : "good",
        headline: `KES ${nf(f.spent)} spent, ${pct(used)} of the KES ${nf(f.limit)} limit`,
        why: `Since the limits were gazetted, ${pct(Math.max(0, elapsed))} of the time to polling day has gone. Most spending belongs in the campaign period.`,
      });
    } else {
      out.push({
        workstream: "money",
        key: "limit",
        tone: "watch",
        headline: "The seat's spending limit is not on file",
        why: "Add it from the Election Campaign Financing Regulations, 2026, so every shilling is measured against it.",
      });
    }
    if (f.raised !== null && f.raised < f.spent) {
      out.push({
        workstream: "money",
        key: "cash",
        tone: "urgent",
        headline: `KES ${nf(f.spent - f.raised)} more spent than raised`,
        why: "From the ledger's contributions and expenses.",
      });
    }
  }
  const order = { urgent: 0, watch: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

const m = (
  phase: PhaseKey,
  workstream: Workstream,
  word: string,
  title: string,
  why: string,
  how: string[],
  by: string | null,
  measure: string | null,
): Milestone => ({
  key: `${phase}-${workstream}-${word}`,
  workstream,
  title,
  why,
  how,
  by,
  measure,
});

/**
 * The starting plan: what every campaign for this seat has to get done in each phase, with this
 * campaign's own numbers where the records have them. The AI's draft starts from it.
 */
export function baseRoadmap(f: Figures, today: string): Roadmap {
  const need = Math.max(f.streams, f.stations);
  const missingAgents = Math.max(0, need - f.staffed);
  const s = seatDates(f.level);
  const wardLevel = f.level === "mca";
  const unit = wardLevel ? "polling centre" : "ward";
  const msByPhase: Record<PhaseKey, Milestone[]> = {
    build: [
      m(
        "build",
        "registration",
        "drive",
        "Register supporters who aren't on the roll",
        "Registration stops about 60 days before polling. Every supporter not registered by then is a vote lost, and first-time voters are the biggest pool.",
        [
          "Ask at every door and event: are you registered, and where do you vote?",
          "Take people to the constituency IEBC office or a Huduma Centre with their ID; IEBC registers there all year.",
          "Colleges, boda stages, churches' youth groups and markets on weekends.",
        ],
        "2027-02-10",
        "New registrations helped, counted at the door",
      ),
      m(
        "build",
        "agents",
        "coordinators",
        `A coordinator for every ${unit}`,
        "Agents are recruited and kept by someone local who answers for them.",
        [
          `One named coordinator per ${unit}, then one per polling centre.`,
          "Coordinators recruit agents from people who already volunteer.",
        ],
        "2026-12-15",
        `${unit[0]!.toUpperCase()}${unit.slice(1)}s with a named coordinator`,
      ),
      m(
        "build",
        "agents",
        "recruit",
        need
          ? `Find agents for ${missingAgents ? `the ${nf(missingAgents)} streams without one` : "a reserve"}`
          : "Find polling agents",
        "IEBC must have every agent's name by 27 July 2027. Recruiting late means strangers at the stations that matter most.",
        [
          "Recruit from the people who knocked doors: they already know the polling centre.",
          "Aim for one agent per stream and a reserve of one in five.",
        ],
        "2027-02-10",
        `Agents named (now ${nf(f.staffed)} of ${nf(need)})`,
      ),
      m(
        "build",
        "field",
        "walk",
        `Walk every ${wardLevel ? "street" : "ward"} once`,
        "The first pass finds supporters, the unregistered and what each area is angry about.",
        [
          "Walk lists on days and in hands every week (Field plan).",
          "Record every door, so the second pass goes where it counts.",
        ],
        "2027-02-10",
        f.doors !== null ? `Doors knocked (now ${nf(f.doors)})` : "Doors knocked",
      ),
      m(
        "build",
        "rallies",
        "presence",
        "Be seen every week, within the law",
        "Open campaigning is unlawful before the campaign period, but visits, funerals, churches, markets, harambees and media are not.",
        [
          "At least three public appearances a week, spread across wards.",
          "Notify police 3 to 14 days ahead of any public meeting (Public Order Act).",
        ],
        null,
        "Appearances in the diary per week",
      ),
      m(
        "build",
        "coalition",
        "route",
        "Decide the route to the ballot",
        "A party ticket means a primary; an independent run means leaving every party by 8 May 2027.",
        [
          "Read your party's nomination rules (filed with IEBC by 6 November 2026).",
          "Meet the people who decide the primary: officials, elders, women's and youth leaders.",
        ],
        "2026-12-31",
        "A decision on the record",
      ),
      m(
        "build",
        "message",
        "case",
        "One case for the seat, in three local promises",
        "People vote on roads, water, jobs and fees. The message comes from what doors and posts say.",
        [
          "Read the issues the doors and Listening raise most, by ward.",
          "Test the promises in meetings before printing anything.",
        ],
        "2027-01-15",
        null,
      ),
      m(
        "build",
        "digital",
        "lists",
        "Grow the list people agreed to",
        "Every supporter who says yes to SMS or WhatsApp can be reached on polling day for free.",
        [
          "Ask for consent at every door and event.",
          "One weekly message: no spam, STOP always works.",
        ],
        null,
        f.reachable !== null ? `People who can be messaged (now ${nf(f.reachable)})` : null,
      ),
      m(
        "build",
        "money",
        "budget",
        "A budget against the limit, and the money raised",
        "Most spending belongs in the campaign period, and every shilling is reported against the gazetted limit.",
        [
          "Budget agents' stipends and polling-day costs first: they are what can't be cut.",
          "Record every contribution and expense in Finance as it happens.",
        ],
        "2026-12-31",
        f.limit ? `Spend against KES ${nf(f.limit)}` : "Spending limit on file",
      ),
      m(
        "build",
        "rivals",
        "map",
        "Know where each rival is strong",
        "Strength is by place: where they won last time, where their party is rising, who backs them.",
        [
          "Elections and Strategy pages: last result by ward.",
          "Listening: what they post and what is said.",
        ],
        "2026-12-15",
        null,
      ),
    ],
    primaries: [
      m(
        "primaries",
        "coalition",
        "members",
        "Supporters on the party's membership list",
        "Only members vote in a party primary, and the lists go to IEBC by 16 March 2027.",
        [
          "Sign up supporters as party members ward by ward.",
          "Check the list the party files has your people on it.",
        ],
        "2027-03-16",
        "Supporters confirmed as members",
      ),
      m(
        "primaries",
        "coalition",
        "primary",
        "Win the primary",
        "The ticket is settled, disputes and all, by 8 May 2027.",
        [
          "Agents at every primary polling point.",
          "A lawyer ready for the party tribunal and the PPDT.",
        ],
        "2027-05-08",
        null,
      ),
      m(
        "primaries",
        "agents",
        "train",
        "Train agents on the primary",
        "The primary is the rehearsal for polling day.",
        ["Who stands where, what to watch, how to photograph a tally."],
        "2027-04-15",
        "Agents trained",
      ),
      m(
        "primaries",
        "field",
        "second",
        "Second pass at the doors that matter",
        "Back to the undecided and the unregistered from the first pass.",
        ["Walk lists built from the first pass's records."],
        "2027-05-08",
        null,
      ),
      m(
        "primaries",
        "money",
        "raise",
        "Raise for the campaign period",
        "Spending peaks from late May.",
        ["Harambees within the rules; every contribution on the ledger."],
        "2027-05-08",
        null,
      ),
    ],
    ticket: [
      m(
        "ticket",
        "coalition",
        "papers",
        `Nomination papers to IEBC (${s.nominate[0]} to ${s.nominate[1]})`,
        "Missing paperwork ends a campaign.",
        ["Certificates, fee, supporters' signatures and party letter checked twice."],
        s.nominate[1],
        null,
      ),
      m(
        "ticket",
        "registration",
        "inspect",
        "Supporters check their names on the register",
        "The register is open for inspection before it is certified. A name in the wrong place costs a vote.",
        ["SMS supporters how to check; help at the door."],
        "2027-06-11",
        "Supporters who checked",
      ),
      m(
        "ticket",
        "message",
        "launch",
        "Ready to launch on the first lawful day",
        `Your seat's campaign period opens ${s.campaign}.`,
        ["Manifesto, posters, launch venue and police notice ready beforehand."],
        s.campaign,
        null,
      ),
    ],
    campaign: [
      m(
        "campaign",
        "rallies",
        "every-ward",
        "A public meeting in every ward",
        "The campaign period is short; the diary decides who sees you.",
        [
          "Police notified 3 to 14 days ahead; 6am to 6pm.",
          "Markets and boda stages between meetings.",
        ],
        "2027-08-07",
        "Wards with a meeting",
      ),
      m(
        "campaign",
        "agents",
        "submit",
        "Every agent named to IEBC",
        "The deadline is 27 July 2027, and each agent needs an appointment letter on the day.",
        ["Letters printed and signed; oath of secrecy sworn."],
        "2027-07-27",
        `Agents submitted (need ${nf(need)})`,
      ),
      m(
        "campaign",
        "field",
        "persuade",
        "Last pass: persuade and plan turnout",
        "The last doors decide the undecided and fix who needs a lift on the day.",
        ["Every supporter asked: where do you vote, and how will you get there?"],
        "2027-08-07",
        null,
      ),
      m(
        "campaign",
        "digital",
        "reminders",
        "Reminders to everyone who agreed",
        "A message the day before and the morning of polling.",
        ["Polling centre in every message."],
        "2027-08-09",
        null,
      ),
      m(
        "campaign",
        "money",
        "report",
        "Spending reported against the limit",
        "A breach carries a fine of up to KES 2 million, prison, or both.",
        ["Finance's disclosure download, weekly."],
        "2027-08-07",
        null,
      ),
    ],
    polling: [
      m(
        "polling",
        "agents",
        "every-stream",
        "An agent at every stream from opening to the signed 34A",
        "Results are protected by those present when they are signed.",
        ["Food, airtime and transport for agents; a reserve on call."],
        ELECTION_DAY,
        "Streams with an agent all day",
      ),
      m(
        "polling",
        "field",
        "turnout",
        "Get supporters out",
        "Turnout, not persuasion, decides the day.",
        ["Calls and lifts by polling centre through the day."],
        ELECTION_DAY,
        null,
      ),
      m(
        "polling",
        "rivals",
        "tally",
        "Every Form 34A photographed and checked",
        "The tally is checked against what agents saw.",
        ["Polling page: upload each form; compare with the public portal."],
        addDays(ELECTION_DAY, 2),
        "Forms checked",
      ),
    ],
  };
  const phases = phasesFor(f.level, today).map((p) => ({ ...p, milestones: msByPhase[p.key] }));
  return {
    id: null,
    headline: `${daysUntil(today, ELECTION_DAY)} days to polling day: build the machine before anyone may campaign`,
    summary:
      "The starting plan every campaign for this seat needs, with your own numbers where the records have them. Draft it with AI to shape it around your gaps, the news and the team's notes.",
    phases,
    writtenBy: "Groundwork",
    createdAt: null,
  };
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** Stored phases, read without trust: unknown phases and malformed milestones are dropped. */
export function readPhases(v: unknown): Phase[] {
  return list(v).flatMap((p): Phase[] => {
    const o = (p ?? {}) as Record<string, unknown>;
    const key = PHASE_KEYS.find((k) => k === o["key"]);
    const from = str(o["from"], 10);
    const to = str(o["to"], 10);
    if (!key || !DAY.test(from) || !DAY.test(to)) return [];
    const seen = new Set<string>();
    const milestones = list(o["milestones"]).flatMap((x): Milestone[] => {
      const q = (x ?? {}) as Record<string, unknown>;
      const workstream = STREAM_KEYS.find((k) => k === q["workstream"]);
      const title = str(q["title"], 200);
      const k = slug(str(q["key"], 80)) || slug(`${key}-${workstream}-${title}`);
      if (!workstream || !title || !k || seen.has(k)) return [];
      seen.add(k);
      const by = str(q["by"], 10);
      return [
        {
          key: k,
          workstream,
          title,
          why: str(q["why"], 1500),
          how: list(q["how"])
            .map((h) => str(h, 400))
            .filter(Boolean)
            .slice(0, 8),
          by: DAY.test(by) ? by : null,
          measure: str(q["measure"], 300) || null,
        },
      ];
    });
    return [
      {
        key,
        title: str(o["title"], 120) || key,
        from,
        to,
        focus: str(o["focus"], 1500),
        milestones,
      },
    ];
  });
}

export function readRoadmap(row: Record<string, unknown> | null | undefined): Roadmap | null {
  if (!row) return null;
  const headline = str(row["headline"], 300);
  const phases = readPhases(row["phases"]);
  if (!headline || phases.length === 0) return null;
  return {
    id: str(row["id"], 40) || null,
    headline,
    summary: str(row["summary"], 4000),
    phases,
    writtenBy: str(row["written_by"], 120) || null,
    createdAt: str(row["created_at"], 40) || null,
  };
}

/** The phase today falls in. */
export const currentPhase = (r: Pick<Roadmap, "phases">, today: string) =>
  r.phases.find((p) => p.from <= today && today <= p.to) ?? r.phases[0] ?? null;

export type NewsImpact = {
  id: string;
  title: string;
  url: string | null;
  publishedOn: string | null;
  scope: "national" | "county" | "local";
  stance: "strength" | "threat" | "opening" | "context";
  reading: string;
  moves: string[];
  sources: Source[];
  writtenBy: string | null;
  createdAt: string;
};

export function readImpact(row: Record<string, unknown>): NewsImpact | null {
  const id = str(row["id"], 40);
  const title = str(row["title"], 300);
  const reading = str(row["reading"], 3000);
  const scope = (["national", "county", "local"] as const).find((s) => s === row["scope"]);
  const stance = (["strength", "threat", "opening", "context"] as const).find(
    (s) => s === row["stance"],
  );
  if (!id || !title || !reading || !scope || !stance) return null;
  const url = str(row["url"], 500);
  const on = str(row["published_on"], 10);
  return {
    id,
    title,
    url: /^https:\/\//.test(url) ? url : null,
    publishedOn: DAY.test(on) ? on : null,
    scope,
    stance,
    reading,
    moves: list(row["moves"])
      .map((x) => str(x, 400))
      .filter(Boolean)
      .slice(0, 6),
    sources: readSources(row["sources"]),
    writtenBy: str(row["written_by"], 120) || null,
    createdAt: str(row["created_at"], 40),
  };
}

export { keyDates };
