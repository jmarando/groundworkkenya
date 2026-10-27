// What Kenya's law and IEBC say about polling-station results, for /guides/how-a-parallel-tally-works.
// The provisions are the Constitution, the Elections Act, 2011 and the Elections (General)
// Regulations, 2012 as Kenya Law prints them, consolidated to 31 December 2022, which is the latest
// version it had when they were read on 27 October 2026. Each statement carries the provision it
// restates. IEBC has said it has put amendments before Parliament (see CHANGES). Pure.

import type { Source } from "@/lib/brief";
import { PRESS_RELEASE } from "@/lib/election-dates";
import type { Statement } from "@/lib/guides";

export const CONSTITUTION: Source = {
  label: "Constitution of Kenya, Articles 138 and 140 (Kenya Law)",
  url: "https://kenyalaw.org/akn/ke/act/2010/constitution/eng@2010-09-03",
  date: null,
};
export const ACT: Source = {
  label: "Elections Act, 2011 (Kenya Law, consolidated to 31 December 2022)",
  url: "https://kenyalaw.org/akn/ke/act/2011/24/eng@2022-12-31",
  date: null,
};
export const REGULATIONS: Source = {
  label: "Elections (General) Regulations, 2012 (Kenya Law, consolidated to 31 December 2022)",
  url: "https://kenyalaw.org/akn/ke/act/ln/2012/128/eng@2022-12-31",
  date: null,
};
export const CARTER: Source = {
  label: "The Carter Center: Kenya 2022 general elections, preliminary report",
  url: "https://www.cartercenter.org/wp-content/uploads/2022/09/kenya-preliminary-report-2022.pdf",
  date: "2022-09-08",
};
export const BILL_REPORT: Source = {
  label:
    "Kenyans.co.ke: IEBC clarifies election law changes amid claims of a 2027 results livestreaming ban",
  url: "https://www.kenyans.co.ke/news/125747-iebc-clarifies-election-law-changes-amid-claims-2027-results-livestreaming-ban",
  date: "2026-07-30",
};

/** What the Regulations give a candidate and an agent at the polling station. */
export const AT_THE_STATION: Statement[] = [
  {
    says: "The presiding officer may admit to the polling station a candidate, a person nominated as the candidate's deputy, authorised agents, members of the Commission and election officers on duty, police officers on duty, people assisting voters with special needs, and observers and media accredited by the Commission. No more than one agent for each candidate or political party is admitted, and the absence of agents does not invalidate the proceedings. Agents display the official badge the Commission supplies.",
    ref: "Regulation 62(1) to (4)",
    from: REGULATIONS,
  },
  {
    says: "Counting is done in the presence of the candidates or agents. For every ballot paper the presiding officer announces the candidate it was cast for and displays it to the candidates or agents so that they can ascertain the vote, and the count is recorded on a tallying sheet, Form 33. A candidate or agent has the right to dispute the inclusion of a ballot paper in the count, or to object to its rejection.",
    ref: "Regulation 76",
    from: REGULATIONS,
  },
  {
    says: "The presiding officer, the candidates or agents sign the declaration of results. The presiding officer must announce the results at the polling station before communicating them to the returning officer, ask each candidate or agent present to sign, give each political party, candidate or agent a copy of the declaration, and affix a copy at the public entrance to the polling station or at another place convenient and accessible to the public.",
    ref: "Regulation 79(1) and (2A)",
    from: REGULATIONS,
  },
  {
    says: "A candidate or agent who refuses or fails to sign must record the reasons, and if they do not, the presiding officer records the fact. Refusing or failing to sign, or being absent when the results are announced, does not by itself invalidate the results announced.",
    ref: "Regulation 79(3) to (7)",
    from: REGULATIONS,
  },
];

/** How the Act sends results up from the polling stations. */
export const HOW_RESULTS_MOVE: Statement[] = [
  {
    says: "Constituency returning officers tally, announce and declare the final results from each polling station for the National Assembly and county assembly elections. For President, Governor, Senator and county woman representative they collate and announce the results from each polling station and submit them: the President's to the national tallying centre, the others to the county returning officer.",
    ref: "Section 39(1A)",
    from: ACT,
  },
  {
    says: "County returning officers tally, announce and declare the final results from the constituencies in the county for Governor, Senator and county woman representative.",
    ref: "Section 39(1B)",
    from: ACT,
  },
  {
    says: "For a presidential election the Commission must electronically transmit and physically deliver the tabulated results from each polling station to the constituency and national tallying centres, tally and verify them there, and publish the polling result forms on an online public portal.",
    ref: "Section 39(1C)",
    from: ACT,
  },
  {
    says: "The Commission must verify that the results transmitted are an accurate record of the results tallied, verified and declared at the polling stations. Where the electronically transmitted and the physically delivered results differ, the one that is an accurate record of what was tallied, verified and declared at the polling station prevails.",
    ref: "Section 39(1D) and (1E)",
    from: ACT,
  },
];

/** What counts as the result. */
export const WHO_DECLARES: Statement[] = [
  {
    says: "The Commission determines, declares and publishes the results of an election immediately after the close of polling.",
    ref: "Section 39(1)",
    from: ACT,
  },
  {
    says: "For the presidential election, after the votes are counted in the polling stations the Commission tallies and verifies the count and declares the result, and the chairperson declares it within seven days after the election.",
    ref: "Articles 138(3)(c) and 138(10)",
    from: CONSTITUTION,
  },
  {
    says: "A failure to transmit or publish results in electronic form does not invalidate the result as announced and declared by the presiding and returning officers.",
    ref: "Section 39(1F)",
    from: ACT,
  },
  {
    says: "Results live-streamed as they are announced at polling stations are for public information only and are not the basis for a declaration by the Commission.",
    ref: "Section 39(1G)",
    from: ACT,
  },
  {
    says: "The Carter Center's report on the 2022 election says that under the Elections Act the declaration of results is the sole responsibility of IEBC, and that only the polling-station Forms 34A are legally binding, citing the decision in Independent Electoral & Boundaries Commission v Maina Kiai & 5 Others [2017] eKLR.",
    ref: "Results transmission section",
    from: CARTER,
  },
];

/** What the public portal showed in 2022. */
export const PORTAL_2022: Statement[] = [
  {
    says: "Less than 24 hours after the polls closed, scans of 97.71 percent of the polling-station results forms had been posted on the public portal (as of 2:40 p.m. on 10 August 2022), and by 12 August more than 99 percent of the Forms 34A had been received.",
    ref: "Results transmission and verification sections",
    from: CARTER,
  },
  {
    says: "The portal posted scans of the forms, not the figures in them. The Carter Center said the verification process could have been strengthened by posting the numeric tallies on the portal, which would let the media and interested parties check the tabulated results.",
    ref: "Results verification section",
    from: CARTER,
  },
];

/** The time limits for challenging a result. */
export const IF_THEY_DIFFER: Statement[] = [
  {
    says: "A petition to question the validity of an election, other than a presidential election, must be filed within twenty-eight days after the declaration of the results and served within fifteen days of presentation.",
    ref: "Section 76(1)(a)",
    from: ACT,
  },
  {
    says: "A petition to challenge the election of the President-elect is filed in the Supreme Court within seven days after the declaration of the results of the presidential election.",
    ref: "Article 140(1)",
    from: CONSTITUTION,
  },
];

/** What IEBC has said may change before the election. */
export const CHANGES: Statement[] = [
  {
    says: "IEBC says it has submitted to Parliament the Elections Laws (Amendment) Bill, 2026, and draft amendments to the Elections (General), Voter Registration, Voter Education, Party List and Party Primaries, and Technology Regulations.",
    ref: "Paragraphs 37 to 39",
    from: PRESS_RELEASE,
  },
  {
    says: "On 30 July 2026 IEBC said the Bill does not propose to amend section 44 of the Elections Act, would add a complementary way to transmit results where there is no network coverage, and does not seek to scrap live streaming of results. IEBC said results would be checked by comparing the original paper Form 34A with the electronically transmitted image.",
    ref: "Article of 30 July 2026",
    from: BILL_REPORT,
  },
];

export type FormRow = {
  race: string;
  /** The form signed at the polling station. */
  station: string;
  /** The form at the constituency tallying centre, and whether it collates or declares. */
  constituency: { form: string; does: "collation" | "declaration" };
  /** The form at the county tallying centre. */
  county: string | null;
  /** The form at the national tallying centre. */
  national: string | null;
};

/** The result forms in the Schedule to the Regulations, race by race. */
export const FORMS: FormRow[] = [
  {
    race: "President",
    station: "34A",
    constituency: { form: "34B", does: "collation" },
    county: null,
    national: "34C",
  },
  {
    race: "Member of the National Assembly",
    station: "35A",
    constituency: { form: "35B", does: "declaration" },
    county: null,
    national: null,
  },
  {
    race: "Member of a County Assembly (ward)",
    station: "36A",
    constituency: { form: "36B", does: "declaration" },
    county: null,
    national: null,
  },
  {
    race: "County Governor",
    station: "37A",
    constituency: { form: "37B", does: "collation" },
    county: "37C",
    national: null,
  },
  {
    race: "Senator",
    station: "38A",
    constituency: { form: "38B", does: "collation" },
    county: "38C",
    national: null,
  },
  {
    race: "County Woman Representative",
    station: "39A",
    constituency: { form: "39B", does: "collation" },
    county: "39C",
    national: null,
  },
];
