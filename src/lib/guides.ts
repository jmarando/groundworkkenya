// The guides under /guides: one list for the index page, the links between the guides, the sitemap
// and llms.txt (tests/guides.test.ts checks those against it). A guide states only facts its sources
// print, each with a visible link, and says so where its sources differ. Pure.

import type { Source } from "@/lib/brief";

/** The day the guides' facts were last checked against their sources, and the sitemap's lastmod. */
export const CHECKED = "2026-10-27";

/** One sourced statement: what it says, where in the source, and the source. */
export type Statement = { says: string; ref: string; from: Source };

export const GUIDES = [
  {
    path: "/guides/2027-election-dates",
    crumb: "2027 election dates",
    title: "2027 election dates: IEBC's gazetted timetable · Groundwork",
    description:
      "Every date IEBC has gazetted for Kenya's 10 August 2027 general election, seat by seat, with the notice each comes from and the High Court ruling on the date.",
    summary:
      "Every date IEBC has gazetted for the general election of 10 August 2027, seat by seat, with the notice each one comes from.",
  },
  {
    path: "/guides/2027-campaign-spending-limits",
    crumb: "2027 campaign spending limits",
    title: "2027 campaign spending limits by seat · Groundwork",
    description:
      "IEBC's 2027 campaign spending limits for every seat, county by county, from Gazette Notice 12251, and what is known of the court challenge to them.",
    summary:
      "What a candidate for each seat may spend, county by county, constituency by constituency and ward by ward, from IEBC's Gazette Notice 12251.",
  },
  {
    path: "/guides/how-a-parallel-tally-works",
    crumb: "How a parallel tally works",
    title: "How a parallel tally works in Kenya · Groundwork",
    description:
      "What the Elections Act and Regulations give candidates and agents at the polling station, how Forms 34A to 39C fit together, and why only IEBC declares results.",
    summary:
      "What the law gives a candidate's agent at the polling station, how the result forms fit together, and why only IEBC declares results.",
  },
] as const;

export type GuidePath = (typeof GUIDES)[number]["path"];
