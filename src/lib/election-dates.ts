// The 2027 general election's dates exactly as IEBC printed them: its Kenya Gazette special issue of
// 20 August 2026 (Vol. CXXVIII, No. 144, Notices 13497 to 13503) and its press release of the same
// day. Nothing here comes from a news report or an estimate. Where the two documents differ, both are
// kept and the entry says so. tests/election-dates.test.ts checks every weekday against the one IEBC
// printed. Pure.

import type { Source } from "@/lib/brief";
import type { Statement } from "@/lib/guides";

export const POLLING_DAY = "2027-08-10";

export const GAZETTE: Source = {
  label: "Kenya Gazette special issue, Vol. CXXVIII, No. 144 (IEBC Notices 13497 to 13503)",
  url: "https://www.iebc.or.ke/uploads/resources/3MMJlcBEs1.pdf",
  date: "2026-08-20",
};
export const PRESS_RELEASE: Source = {
  label: "IEBC press release: Status of election preparedness",
  url: "https://www.iebc.or.ke/uploads/resources/j6iEmZgi3w.pdf",
  date: "2026-08-20",
};
export const CONSTITUTION: Source = {
  label: "Constitution of Kenya, Article 101(1) (Kenya Law)",
  url: "https://kenyalaw.org/akn/ke/act/2010/constitution/eng@2010-09-03",
  date: null,
};
export const ELECTIONS_ACT: Source = {
  label: "Elections Act, 2011, section 5 (Kenya Law, consolidated to 31 December 2022)",
  url: "https://kenyalaw.org/akn/ke/act/2011/24/eng@2022-12-31",
  date: null,
};
export const RULING_REPORT: Source = {
  label: "Kenyans.co.ke: High Court declares 2027 presidential election invalid, suspends order",
  url: "https://www.kenyans.co.ke/news/125976-high-court-declares-2027-presidential-election-invalid-suspends-order",
  date: "2026-08-07",
};
export const NDERITU_REPORT: Source = {
  label:
    "Kenyans.co.ke: IEBC official explains why 2027 election date remains August 10 despite court ruling",
  url: "https://www.kenyans.co.ke/news/126442-iebc-official-explains-why-2027-election-date-remains-august-10-despite-court-ruling",
  date: "2026-08-24",
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const weekdayOf = (iso: string): string => DAYS[utc(iso).getUTCDay()] ?? "";

/** "Tuesday 10 August 2027", or "10 August 2027" without the weekday. Plain arithmetic, so the server and the browser agree. */
export function formatDay(iso: string, weekday = true): string {
  const d = utc(iso);
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return weekday ? `${DAYS[d.getUTCDay()]} ${day}` : day;
}

/** A day counted from another by calendar months and then days (a day of the month that exists in both). */
export function dayOf(iso: string, shift: { months?: number; days?: number }): string {
  const d = utc(iso);
  if (shift.months) d.setUTCMonth(d.getUTCMonth() + shift.months);
  if (shift.days) d.setUTCDate(d.getUTCDate() + shift.days);
  return d.toISOString().slice(0, 10);
}

export type DateEntry = {
  /** The day, as `YYYY-MM-DD`. */
  on: string;
  /** The weekday IEBC printed beside it, or null where it printed none. */
  printed: string | null;
  /** Who it is for. */
  who: string;
  /** What happens, in IEBC's terms. */
  what: string;
  /** Where in the source it is printed. */
  ref: string;
  from: Source;
  /** What else to know: another document's date, a rule the same notice points to. */
  note?: string;
};

/** Every date IEBC has set, in order. */
export const DATES: DateEntry[] = [
  {
    on: "2026-10-15",
    printed: "Thursday",
    who: "Political parties",
    what: "Submit the names and specimen signatures of their authorized persons.",
    ref: "Notice 13497 (b)",
    from: GAZETTE,
  },
  {
    on: "2026-10-30",
    printed: "Friday",
    who: "Political parties",
    what: "Have their nomination rules certified by the Registrar of Political Parties.",
    ref: "Notice 13497 (c)",
    from: GAZETTE,
  },
  {
    on: "2026-11-06",
    printed: "Friday",
    who: "Political parties",
    what: "Submit their certified nomination rules to the Commission.",
    ref: "Notice 13497 (d)",
    from: GAZETTE,
  },
  {
    on: "2026-12-09",
    printed: "Wednesday",
    who: "Anyone who wants to contest",
    what: "The harambee rule applies after this day: a person who directly or indirectly participates in any public fundraising or harambee within eight months before a general election, that is after this date, is disqualified from contesting in the election.",
    ref: "Notices 13497 to 13502",
    from: GAZETTE,
    note: "Note 5 of the same notices draws attention to section 26(2) of the Elections Act, 2011, which does not prohibit fundraising by or on behalf of a person contesting an election, or fundraising for a political party.",
  },
  {
    on: "2027-02-10",
    printed: "Wednesday",
    who: "Public officers who intend to contest",
    what: "Resign from public office, within six months before the election.",
    ref: "Notice 13497 (n)",
    from: GAZETTE,
  },
  {
    on: "2027-02-10",
    printed: "Wednesday",
    who: "Political parties and candidates",
    what: "Open the Election Campaign Financing account and submit its details to the Commission.",
    ref: "Notice 13503 (b)",
    from: GAZETTE,
  },
  {
    on: "2027-03-16",
    printed: "Tuesday",
    who: "Political parties",
    what: "Submit their membership lists to the Commission and, the same day, the names of the candidates contesting in their primaries with the dates and venues.",
    ref: "Press release, paragraph 18",
    from: PRESS_RELEASE,
    note: "The Gazette prints other dates for these steps: 23 March, 8 April and 12 April.",
  },
  {
    on: "2027-03-23",
    printed: "Tuesday",
    who: "Political parties",
    what: "Have their membership lists certified by the Registrar of Political Parties.",
    ref: "Notice 13497 (e)",
    from: GAZETTE,
  },
  {
    on: "2027-04-08",
    printed: "Thursday",
    who: "Political parties",
    what: "Submit the names of the persons contesting in their primaries, with the date and venues of the primaries, at least 21 days before nomination day.",
    ref: "Notice 13497 (g)",
    from: GAZETTE,
  },
  {
    on: "2027-04-12",
    printed: "Monday",
    who: "Political parties",
    what: "Submit the certified party membership list to the Commission.",
    ref: "Notice 13497 (f)",
    from: GAZETTE,
  },
  {
    on: "2027-04-16",
    printed: "Friday",
    who: "The Commission",
    what: "Publishes in the Gazette the names of the persons contesting in a party primary and the date of the primary, within seven days of receipt of the names of the candidates.",
    ref: "Notice 13497 (h)",
    from: GAZETTE,
    note: 'The notice ends the sentence "by Friday 16th April, 2027", which can be read as the day the names are due or the day of publication.',
  },
  {
    on: "2027-05-08",
    printed: "Saturday",
    who: "Political parties",
    what: "Conduct their primaries and resolve intra-party disputes, and submit to the Commission the name of each person nominated through a primary or by direct nomination.",
    ref: "Notice 13497 (i), (j)",
    from: GAZETTE,
  },
  {
    on: "2027-05-08",
    printed: "Saturday",
    who: "Independent candidates",
    what: "Must not be members of any registered political party (at least three months before the election), and submit to the Commission the name and symbol they will use.",
    ref: "Notice 13497 (k), (l)",
    from: GAZETTE,
  },
  {
    on: "2027-05-14",
    printed: "Friday",
    who: "The Commission",
    what: "Publishes in the Gazette the names and symbols of the independent candidates, at least fourteen days before nomination day.",
    ref: "Notice 13497 (m)",
    from: GAZETTE,
  },
  {
    on: "2027-05-24",
    printed: "Monday",
    who: "Presidential candidates",
    what: "Deliver to the Commission a list of the names, signatures and identity card or passport numbers of at least 2,000 registered voters in each of a majority of the counties.",
    ref: "Notice 13497 (o)",
    from: GAZETTE,
  },
  {
    on: "2027-05-29",
    printed: "Saturday",
    who: "Political parties and candidates",
    what: "Submit the names of the authorized persons who manage the Election Campaign Financing account and of the members of the expenditure committee.",
    ref: "Notice 13503 (a), (d)",
    from: GAZETTE,
  },
  {
    on: "2027-05-29",
    printed: "Saturday",
    who: "President, National Assembly and Senate",
    what: "Nomination days open and the campaign period starts. The other seats start later: see the dates by seat.",
    ref: "Notices 13497, 13498 and 13499",
    from: GAZETTE,
  },
  {
    on: "2027-06-08",
    printed: "Tuesday",
    who: "Party candidates",
    what: "Submit a preliminary nomination expenditure report to their party and the Commission, within twenty-one days of the party nomination and in any event not later than this day.",
    ref: "Notice 13503 (c)",
    from: GAZETTE,
  },
  {
    on: "2027-06-11",
    printed: null,
    who: "Voters",
    what: "Registration of voters and revision of the register stop for the sixty days before polling day (Elections Act, section 5(1)(a)). This is the first of those days.",
    ref: "Elections Act, section 5(1)(a)",
    from: ELECTIONS_ACT,
    note: "Counted back sixty days from polling day. IEBC's notices do not print this date.",
  },
  {
    on: "2027-06-12",
    printed: "Saturday",
    who: "Anyone with a dispute about the Commission's nomination",
    what: "Lodge it within twenty-four hours of the event and in any event not later than this day.",
    ref: "Notice 13497 (q)",
    from: GAZETTE,
  },
  {
    on: "2027-06-23",
    printed: "Wednesday",
    who: "The Commission",
    what: "Determines nomination disputes within ten days of their being lodged; the hearing of the disputes is not later than this day.",
    ref: "Notice 13497 (r)",
    from: GAZETTE,
  },
  {
    on: "2027-06-25",
    printed: "Friday",
    who: "Political parties",
    what: "Submit their Party Lists to the Commission.",
    ref: "Notices 13498, 13499, 13500 and 13502",
    from: GAZETTE,
    note: 'Notice 13499 prints "Saturday, 25th June, 2027"; 25 June 2027 is a Friday, as the other three notices print it.',
  },
  {
    on: "2027-07-27",
    printed: "Tuesday",
    who: "Political parties and candidates",
    what: "Appoint and submit to the Commission the names of their Chief Election Agents: national and constituency for the President; county and constituency for the National Assembly, Senate, County Governor and County Woman Representative; constituency for County Assembly Ward.",
    ref: "Notices 13497 to 13502 (u)",
    from: GAZETTE,
  },
  {
    on: "2027-08-07",
    printed: "Saturday",
    who: "Everyone",
    what: "The campaign period ends, 48 hours before polling day. Campaign time runs from 7.00 a.m. to 6.00 p.m. during the campaign period.",
    ref: "Notice 13497 (s), (t)",
    from: GAZETTE,
  },
  {
    on: POLLING_DAY,
    printed: "Tuesday",
    who: "Voters",
    what: 'Polling day: "An election of the President of the Republic of Kenya shall be held on Tuesday, 10th August, 2027."',
    ref: "Notice 13497 (a), (w)",
    from: GAZETTE,
  },
  {
    on: "2027-11-08",
    printed: null,
    who: "Political parties and candidates",
    what: "Notification and report on the action taken on any surplus campaign funds.",
    ref: "Notice 13503 (h)",
    from: GAZETTE,
  },
  {
    on: "2027-11-22",
    printed: "Monday",
    who: "Party candidates, political parties and independent candidates",
    what: "Submit the final expenditure report within three months after the election: party candidates to their party and the Commission, parties and independent candidates to the Commission.",
    ref: "Notice 13503 (e), (f), (g)",
    from: GAZETTE,
  },
];

export type SeatDates = {
  seat: string;
  /** The Gazette notice for the seat's election. */
  notice: string;
  nominationFrom: string;
  nominationTo: string;
  campaignFrom: string;
  /** Who receives the nomination papers. */
  papersTo: string;
  /** The weekdays IEBC printed: nominations open, nominations close, campaign starts. */
  printed: [string, string, string];
};

/** The nomination days and the start of the campaign, seat by seat. */
export const SEATS: SeatDates[] = [
  {
    seat: "President",
    notice: "13497",
    nominationFrom: "2027-05-29",
    nominationTo: "2027-06-11",
    campaignFrom: "2027-05-29",
    papersTo: "the Chairperson of the Commission",
    printed: ["Saturday", "Friday", "Saturday"],
  },
  {
    seat: "National Assembly",
    notice: "13498",
    nominationFrom: "2027-05-29",
    nominationTo: "2027-06-01",
    campaignFrom: "2027-05-29",
    papersTo: "the respective Returning Officer",
    printed: ["Saturday", "Tuesday", "Saturday"],
  },
  {
    seat: "Senate",
    notice: "13499",
    nominationFrom: "2027-05-29",
    nominationTo: "2027-06-02",
    campaignFrom: "2027-05-29",
    papersTo: "the respective Returning Officer",
    printed: ["Saturday", "Wednesday", "Saturday"],
  },
  {
    seat: "County Governor",
    notice: "13501",
    nominationFrom: "2027-06-03",
    nominationTo: "2027-06-06",
    campaignFrom: "2027-06-03",
    papersTo: "the respective Returning Officer",
    printed: ["Thursday", "Sunday", "Thursday"],
  },
  {
    seat: "County Woman Representative",
    notice: "13500",
    nominationFrom: "2027-06-07",
    nominationTo: "2027-06-11",
    campaignFrom: "2027-06-07",
    papersTo: "the respective Returning Officer",
    printed: ["Monday", "Friday", "Monday"],
  },
  {
    seat: "County Assembly Ward",
    notice: "13502",
    nominationFrom: "2027-06-02",
    nominationTo: "2027-06-11",
    campaignFrom: "2027-06-02",
    papersTo: "the respective Returning Officer",
    printed: ["Wednesday", "Friday", "Wednesday"],
  },
];

/** The hours IEBC sets for delivering nomination papers, the same for every seat. */
export const NOMINATION_HOURS =
  "between 8 a.m. and 1 p.m. and between 2 p.m. and 4 p.m., at a place designated by the Commission";

export type Reading = { says: string; ref: string; from: Source };
export type Difference = { title: string; readings: Reading[]; plain: string };

/** Where IEBC's own two documents give different dates for the same thing. */
export const DIFFERENCES: Difference[] = [
  {
    title: "Party membership lists and primary details",
    readings: [
      {
        says: "Membership lists certified by the Registrar of Political Parties by Tuesday 23 March 2027; the names of the persons contesting in primaries, with the date and venues, by Thursday 8 April 2027; the certified list submitted to the Commission by Monday 12 April 2027.",
        ref: "Notice 13497 (e), (f), (g)",
        from: GAZETTE,
      },
      {
        says: 'IEBC says "political parties shall submit their membership lists to the Commission by Tuesday, 16th March 2027. On the same day, they are also required to submit the names of candidates contesting in their party primaries, along with the dates and venues for those primaries."',
        ref: "Paragraph 18",
        from: PRESS_RELEASE,
      },
    ],
    plain: "Where two dates are given for one step, meeting the earlier one meets both.",
  },
  {
    title: "When the campaign period starts",
    readings: [
      {
        says: "Each seat's notice gives its own start: 29 May 2027 for President, National Assembly and Senate; 2 June for County Assembly Ward; 3 June for County Governor; 7 June for County Woman Representative.",
        ref: "Notices 13497 to 13502 (s)",
        from: GAZETTE,
      },
      {
        says: 'IEBC says the campaign period "shall commence upon registration of a candidate by the Commission, but not earlier than 29th May 2027, and shall end on 7th August 2027, 48 hours before Election Day".',
        ref: "Paragraph 24",
        from: PRESS_RELEASE,
      },
    ],
    plain: "Both agree it ends on 7 August 2027 and that nothing starts before 29 May 2027.",
  },
];

/** What is on record about the Malindi High Court ruling on the date of the election. */
export const RULING: Statement[] = [
  {
    says: "IEBC describes the judgment in Dr. Owiso Owiso, Khelef Khalifa and Ashioya Biko v Attorney General & Independent Electoral and Boundaries Commission (Malindi High Court Petition No. HCCHRPET/023/2025): Justice Thande held that the fifth year following the general election of 9 August 2022 began on 9 August 2026, so that the presidential election was constitutionally due on Tuesday 11 August 2026.",
    ref: "Paragraph 12",
    from: PRESS_RELEASE,
  },
  {
    says: 'IEBC adds that the court suspended its decision until the next general election, scheduled for 10 August 2027, that the matter "remains subject to the applicable appellate and constitutional processes", and that the Commission continues to prepare for the 2027 General Election.',
    ref: "Paragraph 13",
    from: PRESS_RELEASE,
  },
  {
    says: 'Reporting the ruling of 7 August 2026, Kenyans.co.ke quotes its order as suspending the declaration "until after the next general election", and reports that Justice Thande said cancelling or postponing the planned 2027 election at this stage would plunge the country into chaos.',
    ref: "Article of 7 August 2026",
    from: RULING_REPORT,
  },
  {
    says: "IEBC commissioner Ann Nderitu told Citizen TV on 23 August 2026 that the judgment itself suspended its implementation until after the 2027 general election, so the Commission is acting in line with the judgment and the law in holding the election on 10 August 2027.",
    ref: "Article of 24 August 2026",
    from: NDERITU_REPORT,
  },
];
