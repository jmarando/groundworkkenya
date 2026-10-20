// The 2027 general election's dates, as IEBC gazetted them on 20 August 2026 (Gazette Notices
// 13497–13503 and 13771) and the law sets them, each with where it was reported. Where reports
// disagree the date says so; where IEBC has set nothing yet the date is marked as the law's or as
// 2022's precedent, never presented as confirmed. Pure.

import type { Source } from "@/lib/brief";

export const ELECTION_DAY = "2027-08-10";

export type Sureness = "confirmed" | "law" | "precedent";
export type KeyDate = {
  key: string;
  on: string;
  /** The last day, for a stretch of days. */
  until: string | null;
  title: string;
  /** What it means for a campaign. */
  means: string;
  sureness: Sureness;
  sources: Source[];
};

const STAR_DATE: Source = {
  label: "The Star: IEBC confirms 10 August 2027",
  url: "https://www.the-star.co.ke/news/2026-06-24-iebc-confirms-august-10-as-date-for-2027-general-election",
  date: "2026-06-24",
};
const KENYANS: Source = {
  label: "Kenyans.co.ke: IEBC sets key dates",
  url: "https://www.kenyans.co.ke/news/126377-iebc-sets-key-dates-ahead-2027-general-election",
  date: "2026-08-21",
};
const NATION_ROADMAP: Source = {
  label: "Nation: IEBC unveils 2027 elections roadmap",
  url: "https://nation.africa/kenya/news/iebc-unveils-2027-elections-roadmap-5508144",
  date: "2026-08-21",
};
const NATION_AGENTS: Source = {
  label: "Nation: IEBC sets strict timelines",
  url: "https://nation.africa/kenya/news/politics/iebc-sets-strict-timelines-as-kenya-prepares-for-2027-general-election-5552252",
  date: "2026-08-21",
};
const STAR_CAMPAIGN: Source = {
  label: "The Star: no campaigns before 29 May 2027",
  url: "https://www.the-star.co.ke/news/2026-08-20-iebc-no-campaigns-before-may-29-2027",
  date: "2026-08-20",
};
const TECHWEEZ: Source = {
  label: "Techweez: IEBC locks in 2027 timeline",
  url: "https://techweez.com/2026/08/21/iebc-locks-in-2027-election-timeline/",
  date: "2026-08-21",
};
const KENYA_TIMES: Source = {
  label: "Kenya Times: IEBC gazettes key deadlines",
  url: "https://thekenyatimes.com/politics/iebc-gazettes-key-deadlines-for-political-parties-candidates-and-public-officers-ahead-of-2027-elections/",
  date: "2026-08-21",
};
const ELECTIONS_ACT: Source = {
  label: "Elections Act 2011, section 5",
  url: "https://www.iebc.or.ke/uploads/resources/G16qxyy4rA.pdf",
  date: null,
};
const ELOG: Source = {
  label: "ELOG 2027 roadmap (subject to IEBC)",
  url: "https://elog.or.ke/wp-content/uploads/2026/05/2027-General-Election-Roadmap.-1.pdf",
  date: "2026-05-01",
};
const PUBLIC_ORDER: Source = {
  label: "Capital FM: police set rally rules (Public Order Act s.5)",
  url: "https://capitalfm.africa/nps-lays-down-ground-rules-for-political-rallies-ahead-of-2027/",
  date: "2026-09-05",
};

/** Nomination and campaign start differ by seat; the president's are the widest. */
const SEAT_DATES: Record<string, { nominate: [string, string]; campaign: string; seat: string }> = {
  president: { nominate: ["2027-05-29", "2027-06-11"], campaign: "2027-05-29", seat: "President" },
  mp: { nominate: ["2027-05-29", "2027-06-01"], campaign: "2027-05-29", seat: "National Assembly" },
  senator: { nominate: ["2027-05-29", "2027-06-02"], campaign: "2027-05-29", seat: "Senate" },
  mca: { nominate: ["2027-06-02", "2027-06-11"], campaign: "2027-06-02", seat: "MCA" },
  governor: { nominate: ["2027-06-03", "2027-06-06"], campaign: "2027-06-03", seat: "Governor" },
  woman_rep: { nominate: ["2027-06-07", "2027-06-11"], campaign: "2027-06-07", seat: "Woman Rep" },
};

export const seatDates = (level: string) => SEAT_DATES[level] ?? SEAT_DATES["president"]!;

/** The dates that shape a campaign for this seat, in order. */
export function keyDates(level: string): KeyDate[] {
  const s = seatDates(level);
  const dates: KeyDate[] = [
    {
      key: "rules",
      on: "2026-11-06",
      until: null,
      title: "Parties file their nomination rules with IEBC",
      means:
        "How your party will pick its candidate is fixed now. Know the rules, and who counts as a member, before you plan the primary.",
      sureness: "confirmed",
      sources: [KENYA_TIMES],
    },
    {
      key: "resign",
      on: "2027-02-10",
      until: null,
      title: "Public officers standing must have resigned",
      means:
        "Six months before polling day. Anyone on your slate or team in public office leaves by now or can't stand. Some reports say 9 February.",
      sureness: "confirmed",
      sources: [TECHWEEZ],
    },
    {
      key: "audit",
      on: "2027-02-01",
      until: "2027-03-31",
      title: "Independent audit of the voter register",
      means:
        "Month only, no exact dates yet. Registrations made before it are the ones you can check by name later.",
      sureness: "precedent",
      sources: [
        {
          label: "The Star: why IEBC's readiness is under scrutiny",
          url: "https://www.the-star.co.ke/news/2026-10-12-2027-election-why-iebcs-readiness-is-under-scrutiny",
          date: "2026-10-12",
        },
      ],
    },
    {
      key: "members",
      on: "2027-03-16",
      until: null,
      title: "Parties hand IEBC their membership lists and primary schedules",
      means:
        "Your supporters must be on your party's list by now to vote in its primary. Other reports say 23 March or 12 April: plan to 16 March.",
      sureness: "confirmed",
      sources: [KENYANS, KENYA_TIMES],
    },
    {
      key: "primaries",
      on: "2027-05-08",
      until: null,
      title: "Primaries held and party disputes settled; independents leave their parties",
      means:
        "The party ticket is decided by now. Running independent means having left any party and filed your name and symbol by this date (some reports say 9 May).",
      sureness: "confirmed",
      sources: [KENYANS, KENYA_TIMES],
    },
    {
      key: "inspection",
      on: "2027-05-12",
      until: "2027-06-11",
      title: "Voter register open for inspection",
      means:
        "At least 30 days in law. Send supporters to check their names and polling centre. Dates are ELOG's estimate; in 2022 it ran 4 May to 2 June.",
      sureness: "precedent",
      sources: [ELOG, ELECTIONS_ACT],
    },
    {
      key: "nomination",
      on: s.nominate[0],
      until: s.nominate[1],
      title: `IEBC nominates ${s.seat} candidates`,
      means:
        "Papers, fee, supporters' signatures and certificates ready before your day. Disputes are filed by 12 June and decided within ten days.",
      sureness: "confirmed",
      sources: [NATION_ROADMAP],
    },
    {
      key: "campaign",
      on: s.campaign,
      until: "2027-08-07",
      title: "The campaign period",
      means:
        "Open campaigning is lawful only from now, and only once nominated: posters, billboards and caravans before this are offences under the Code of Conduct. It ends 48 hours before polling.",
      sureness: "confirmed",
      sources: [STAR_CAMPAIGN],
    },
    {
      key: "register-closes",
      on: "2027-06-11",
      until: null,
      title: "Registration and transfers stop",
      means:
        "No registering or moving polling centre in the 60 days before an election. Anyone not registered by about now can't vote for you.",
      sureness: "law",
      sources: [ELECTIONS_ACT],
    },
    {
      key: "agents",
      on: "2027-07-27",
      until: null,
      title: "Agents' names to IEBC",
      means:
        "Every polling-station agent named and submitted. Each needs an appointment letter at their station at least 48 hours before polls close.",
      sureness: "confirmed",
      sources: [NATION_AGENTS],
    },
    {
      key: "polling",
      on: ELECTION_DAY,
      until: null,
      title: "Polling day",
      means: "Tuesday. An agent at every stream from opening to the signed Form 34A.",
      sureness: "confirmed",
      sources: [STAR_DATE],
    },
  ];
  return dates.sort((a, b) => a.on.localeCompare(b.on));
}

/** The rule every rally runs under, all year. */
export const RALLY_RULE: { text: string; sources: Source[] } = {
  text: "Tell the officer in charge of the local police station 3 to 14 days before any public meeting or procession, with organisers' names, venue or route, date and time; events run 6am to 6pm, and the later-notified of two clashing events moves.",
  sources: [PUBLIC_ORDER],
};

/** Days from `today` to `day`, both Nairobi dates. */
export const daysUntil = (today: string, day: string) =>
  Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
