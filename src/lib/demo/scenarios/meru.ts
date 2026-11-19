// Demo: a county woman representative's campaign in Meru. The 45 wards and their map are real
// (public/geo/meru-wards.json, geoBoundaries), as are each ward's registered voters (IEBC's 2022
// register, 772,139 in all), the 2022 and 2017 woman rep results and the spending limit (Kenya
// Gazette Notice 12251). The candidate is fictional, every other figure is invented and rivals
// are placeholders.

import { hashOf, seeded } from "@/lib/demo/insights";
import type { AreaModel, Scenario } from "@/lib/demo/types";

// constituency, our share, the incumbent's, Challenger B's, turnout 2027, turnout 2022, our
// side's 2022 share, hours to results, wards [slug, name, registered]
type Row = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  [string, string, number][],
];

const ROWS: Row[] = [
  [
    "Igembe South",
    37,
    39,
    9,
    0.66,
    0.64,
    31,
    1.4,
    [
      ["maua", "Maua", 17_213],
      ["kiegoi-antubochiu", "Kiegoi/Antubochiu", 16_514],
      ["athiru-gaiti", "Athiru Gaiti", 14_443],
      ["akachiu", "Akachiu", 14_371],
      ["kanuni", "Kanuni", 14_585],
    ],
  ],
  [
    "Igembe Central",
    36,
    40,
    9,
    0.67,
    0.65,
    30,
    1.5,
    [
      ["akirang-ondu", "Akirang'ondu", 15_637],
      ["athiru-ruujine", "Athiru Ruujine", 19_920],
      ["igembe-east", "Igembe East", 19_964],
      ["njia", "Njia", 21_810],
      ["kangeta", "Kangeta", 16_103],
    ],
  ],
  [
    "Igembe North",
    35,
    41,
    9,
    0.65,
    0.63,
    29,
    1.7,
    [
      ["antuambui", "Antuambui", 17_113],
      ["ntunene", "Ntunene", 11_829],
      ["antubetwe-kiongo", "Antubetwe Kiongo", 15_108],
      ["naathu", "Naathu", 13_879],
      ["amwathi", "Amwathi", 19_121],
    ],
  ],
  [
    "Tigania West",
    39,
    38,
    8,
    0.67,
    0.65,
    33,
    1.2,
    [
      ["athwana", "Athwana", 9_123],
      ["akithii", "Akithii", 16_709],
      ["kianjai", "Kianjai", 21_037],
      ["nkomo", "Nkomo", 13_030],
      ["mbeu", "Mbeu", 10_384],
    ],
  ],
  [
    "Tigania East",
    38,
    39,
    9,
    0.66,
    0.64,
    32,
    1.3,
    [
      ["thangatha", "Thangatha", 21_025],
      ["mikinduri", "Mikinduri", 18_246],
      ["kiguchwa", "Kiguchwa", 11_544],
      ["muthara", "Muthara", 19_902],
      ["karama", "Karama", 12_810],
    ],
  ],
  [
    "North Imenti",
    42,
    36,
    9,
    0.64,
    0.62,
    36,
    0.6,
    [
      ["municipality", "Municipality", 23_655],
      ["ntima-east", "Ntima East", 14_904],
      ["ntima-west", "Ntima West", 19_161],
      ["nyaki-west", "Nyaki West", 21_192],
      ["nyaki-east", "Nyaki East", 17_329],
    ],
  ],
  [
    "Buuri",
    43,
    35,
    8,
    0.68,
    0.66,
    35,
    1,
    [
      ["timau", "Timau", 22_215],
      ["kisima", "Kisima", 18_075],
      ["kiirua-naari", "Kiirua/Naari", 15_690],
      ["ruiri-rwarera", "Ruiri/Rwarera", 11_521],
      ["kibirichia", "Kibirichia", 14_840],
    ],
  ],
  [
    "Central Imenti",
    41,
    37,
    8,
    0.69,
    0.67,
    34,
    0.9,
    [
      ["mwanganthia", "Mwanganthia", 15_057],
      ["abothuguchi-central", "Abothuguchi Central", 24_397],
      ["abothuguchi-west", "Abothuguchi West", 24_723],
      ["kiagu", "Kiagu", 12_318],
    ],
  ],
  [
    "South Imenti",
    42,
    36,
    8,
    0.7,
    0.68,
    35,
    0.8,
    [
      ["mitunguu", "Mitunguu", 14_078],
      ["igoji-east", "Igoji East", 18_203],
      ["igoji-west", "Igoji West", 12_496],
      ["abogeta-east", "Abogeta East", 21_169],
      ["abogeta-west", "Abogeta West", 19_074],
      ["nkuene", "Nkuene", 30_622],
    ],
  ],
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Each ward varies a little around its constituency, the same way every time. */
const areas: AreaModel[] = ROWS.flatMap(
  ([group, us, a, b, turnout, turnout2022, us2022, lag, wards]) =>
    wards.map(([slug, name, registered]) => {
      const r = seeded(hashOf(`meru/${slug}`));
      const tilt = (r() - 0.5) * 6;
      return {
        slug,
        name,
        group,
        registered,
        shares: { us: round1(us + tilt), a: round1(a - tilt), b },
        turnout: round1((turnout + (r() - 0.5) * 0.05) * 100) / 100,
        turnout2022: round1((turnout2022 + (r() - 0.5) * 0.05) * 100) / 100,
        us2022: round1(us2022 + (r() - 0.5) * 5),
        lag: round1(lag + r() * 0.4),
      };
    }),
);

export const meru: Scenario = {
  key: "meru",
  office: "woman_rep",
  officeLabel: "Woman Representative",
  seat: "Meru County",
  candidate: {
    name: "Kendi Mbaabu",
    first: "Kendi",
    initials: "KM",
    party: "National party",
    fictional: true,
  },
  contenders: [
    {
      key: "us",
      name: "Kendi Mbaabu",
      short: "Kendi",
      party: "National party",
      tone: "us",
      us: true,
    },
    { key: "a", name: "The incumbent", short: "The incumbent", party: "UDA", tone: "a" },
    { key: "b", name: "Challenger B", short: "Challenger B", party: "Independent", tone: "b" },
  ],
  geo: { file: "/geo/meru-wards.json", unit: "ward", units: "wards", group: "Constituency" },
  areas,
  winNumber: { target: 280_000, found: 151_600 },
  today: [
    {
      title: "Walk Kangeta market before the miraa lorries leave",
      detail:
        "Buyers paid less for a third week (demo). Igembe is your weakest belt, 36 to 40 in Igembe Central. Be there at 05:30 with the ward coordinator, listen to the women who trade on credit, and say what a woman rep can do.",
      action: {
        kind: "task",
        label: "Call the ward coordinator",
        task: "Call the Kangeta coordinator before 05:00 about the market walk",
      },
    },
    {
      title: "Meet the table-banking groups in Nkubu at 11am",
      detail:
        "32 women's groups and 6 youth groups (demo). South Imenti is the county's biggest constituency, with 115,642 voters. The group leaders are your organisers: thank them by name.",
      action: {
        kind: "task",
        label: "Block 10:30–13:30",
        task: "Nkubu table-banking groups, arrive 10:45",
      },
    },
    {
      title: "Announce Saturday's sanitary-pad drive for schools",
      detail:
        "40 schools across the nine constituencies (demo). Good news that every parent hears about, and the best visibility moment of the month.",
      action: {
        kind: "draft",
        label: "Draft the announcement",
        title: "Sanitary pads for 40 schools on Saturday",
        body: "On Saturday we start delivering sanitary pads to girls in 40 schools across all nine constituencies of Meru. No girl should miss school for want of them. Head teachers and parents' associations: the list of schools is with your ward coordinator. Thank you to every women's group that gave its time.",
      },
    },
  ],
  story: {
    tag: "Local",
    kicker: "Miraa · Igembe and Tigania",
    headline: "Miraa prices fall for a third week in Igembe's markets",
    summary:
      "Buyers at Kangeta, Maua and Laare paid less again as export orders slowed. The women who trade the leaf on credit feel it first (demo).",
    numbers: [
      { value: "3 weeks", label: "of falling prices" },
      { value: "5 of 9", label: "constituencies grow miraa" },
      { value: "22%", label: "name crop prices as their first issue" },
    ],
    rivals:
      "The incumbent spoke on miraa at a church harambee in Maua on Sunday. Challenger B hasn't spoken.",
    line: "A woman rep can't set the price. Say what you will do this month: take the women traders' case to Parliament's agriculture committee, and set up a credit line through the women's groups so one bad week doesn't become a lost season.",
    actions: [
      {
        kind: "poll",
        label: "Ask the traders",
        ask: "Has this week's miraa price hurt your household?",
      },
      {
        kind: "draft",
        label: "Draft the traders' statement",
        title: "Miraa traders: what we will do",
        body: "The miraa price has fallen for three weeks and the women who trade it on credit are carrying the loss. This month I will take their case to Parliament's agriculture committee, and with the women's groups we will start a credit line so that one bad week does not cost a family its season. Meet me at Kangeta market on Thursday morning.",
      },
    ],
    source: "Ward coordinators and SMS replies (demo)",
    time: "06:05",
  },
  news: [
    {
      tag: "Economy",
      headline: "Tea farmers in Imenti wait for the date of the second payment",
      soWhat:
        "Imenti is your strongest belt. Be the first to say the date when the factories post it, and be at a buying centre that week.",
      source: "Factory notice board (demo)",
      time: "Yesterday",
    },
    {
      tag: "Local",
      headline: "Water rationing in Meru town as the dry spell drags on",
      soWhat:
        "Municipality ward has 23,655 voters and most of them buy water this week. Ask where it hurts most before you speak.",
      source: "Residents' WhatsApp groups (demo)",
      time: "07:15",
      action: {
        kind: "poll",
        label: "Ask about water",
        ask: "How many days this week did water reach your home?",
      },
    },
    {
      tag: "Opponent",
      headline: "The incumbent's women's forum draws about 3,000 in Meru town",
      soWhat:
        "Her machine is the women's groups she has funded. Yours has to be the groups she missed, ward by ward.",
      source: "Ward coordinator report (demo)",
      time: "Yesterday 17:50",
    },
    {
      tag: "Party",
      headline: "Party officials meet in Meru on the nomination timetable",
      soWhat:
        "The nomination rules are due soon. Have your papers, your agents' list and your fee ready before they are.",
      source: "Party secretariat (demo)",
      time: "08:00",
    },
    {
      tag: "Security",
      headline: "Chiefs in Tigania East meet on cattle theft near the county border",
      soWhat:
        "It touches every family in Thangatha and Mikinduri. Stand behind the chiefs and the elders, not ahead of the police.",
      source: "Chief's baraza (demo)",
      time: "06:40",
    },
  ],
  polls: {
    average: [
      { week: "10 Jul", shares: { us: 34, a: 40, b: 8, undecided: 18 } },
      { week: "17 Jul", shares: { us: 34, a: 40, b: 8, undecided: 18 } },
      { week: "24 Jul", shares: { us: 35, a: 39, b: 8, undecided: 18 } },
      { week: "31 Jul", shares: { us: 35, a: 39, b: 9, undecided: 17 } },
      { week: "7 Aug", shares: { us: 36, a: 39, b: 9, undecided: 16 } },
      { week: "14 Aug", shares: { us: 36, a: 38, b: 9, undecided: 17 } },
      { week: "21 Aug", shares: { us: 37, a: 38, b: 9, undecided: 16 } },
      { week: "28 Aug", shares: { us: 37, a: 38, b: 9, undecided: 16 } },
      { week: "4 Sep", shares: { us: 38, a: 37, b: 9, undecided: 16 } },
      { week: "11 Sep", shares: { us: 38, a: 37, b: 9, undecided: 16 } },
      { week: "18 Sep", shares: { us: 39, a: 37, b: 9, undecided: 15 } },
      { week: "25 Sep", shares: { us: 39, a: 36, b: 9, undecided: 16 } },
    ],
    own: {
      date: "20–23 Sep",
      method: "SMS panel, with door-to-door interviews, weighted by constituency",
      n: 1_200,
      moe: 2.8,
      question: "If the woman rep election were held today, who would you vote for?",
      shares: { us: 39, a: 36, b: 9, undecided: 16 },
    },
    outside: [
      {
        pollster: "Pollster A",
        date: "12 Sep",
        n: 800,
        shares: { us: 37, a: 38, b: 9, undecided: 16 },
      },
    ],
    crosstabs: [
      {
        group: "Women 35+",
        us: 47,
        rival: 33,
        note: "Table-banking groups and churches: your strongest group.",
      },
      {
        group: "Men 18–30",
        us: 29,
        rival: 41,
        note: "Boda riders and miraa loaders. Turnout is the question.",
      },
      { group: "Miraa growers and traders", us: 33, rival: 42, note: "The price decides it." },
      { group: "Tea and dairy farmers", us: 45, rival: 34, note: "Payments on time keep them." },
    ],
    ideas: [
      "Has this week's miraa price hurt your household?",
      "How many days this week did water reach your home?",
      "Would your women's group join a county credit line?",
    ],
  },
  opponents: [
    {
      key: "a",
      yesterday:
        "A women's forum in Meru town (spoke for twenty minutes), then a harambee in Maua.",
      message: "Continuity: the grants for women's groups, and the bursaries.",
      voice: 44,
      spend: "≈ KES 1.2M this week (estimate)",
      threat: "high",
      watch: "She is at the Timau women's group on Saturday. Send your Buuri coordinator first.",
    },
    {
      key: "b",
      yesterday: "Door to door in Kianjai with fifteen volunteers.",
      message: "A voice for the youth and the boda riders.",
      voice: 11,
      spend: "Low",
      threat: "low",
      watch: "Splitting the vote in Tigania West; she takes more from the incumbent than from you.",
    },
  ],
  voters: {
    issues: [
      { label: "Crop prices: miraa, tea, coffee", share: 22, change: 4, hot: "Igembe, Tigania" },
      { label: "Water", share: 17, change: 3, hot: "Municipality, Buuri" },
      { label: "Jobs for young people", share: 16, change: 1, hot: "Meru town, Maua" },
      { label: "Bursaries and school fees", share: 14, change: 2, hot: "Every ward" },
      { label: "Safety of women and girls", share: 11, change: 1, hot: "Every ward" },
      { label: "Roads", share: 9, change: 0, hot: "Igembe North, Tigania East" },
    ],
    groups: [
      { label: "Miraa growers and traders", size: "140,000 voters", move: -2, note: "The price." },
      {
        label: "Women's groups (chamas)",
        size: "95,000",
        move: 3,
        note: "Your organisers; they want credit, bursaries and safe roads.",
      },
      { label: "Tea and dairy farmers", size: "120,000", move: 1, note: "Payments on time." },
      { label: "Boda riders", size: "18,000", move: -1, note: "Challenger B's messengers." },
    ],
    quotes: [
      {
        text: "Bei ya miraa imeshuka, hatuna pesa ya karo.",
        translation: "The miraa price has fallen, we have no money for school fees.",
        who: "Woman, 38",
        where: "Igembe Central · SMS reply",
      },
      {
        text: "Maji yanakuja mara mbili tu kwa wiki.",
        translation: "Water comes only twice a week.",
        who: "Woman, 52",
        where: "Municipality · canvass note",
      },
      {
        text: "Give the chamas cheap loans and we will do the rest.",
        who: "Woman, 45",
        where: "Abogeta East · SMS poll",
      },
    ],
    persuadables: {
      count: 96_000,
      note: "Undecided or soft. Most are women under 40 in Tigania and Igembe.",
    },
  },
  lastTime: {
    title: "2022 woman rep election, Meru County",
    official: true,
    source: "IEBC declared results, via BallotWinners: the four leading of the eleven candidates",
    results: [
      { name: "Elizabeth Karambu Kailemia (UDA)", votes: 259_445 },
      { name: "Felicity Nkirote Biriri (DEP)", votes: 164_280 },
      { name: "Edith Nkatha Mwirigi (Independent)", votes: 46_031 },
      { name: "Beth Kanana (ODM)", votes: 8_357 },
    ],
    turnout: null,
    lessons: [
      "In 2022 UDA's Elizabeth Karambu Kailemia won with 259,445 votes (Gazette 9951), 95,165 ahead of DEP's Felicity Nkirote Biriri. Eleven women stood.",
      "In 2017 the seat went to an independent: Kawira Mwangaza beat Jubilee's Florence Kajuju 280,044 to 231,636. Meru has twice elected an independent to a county seat: woman rep in 2017, governor in 2022.",
      "In 2022 the presidential vote here went Ruto 398,946 and Odinga 103,679 (IEBC Form 34C): Ruto took 78.8% of the 506,476 valid votes, with 772,139 on the register.",
    ],
  },
  diary: [
    {
      time: "05:30",
      place: "Kangeta market",
      kind: "Market",
      why: "Before the lorries leave: hear the miraa traders, the women first.",
    },
    {
      time: "08:30",
      place: "Breakfast show, a Kimeru station",
      kind: "Media",
      why: "Say the credit-line plan in Kimeru before the incumbent's forum is the story.",
    },
    {
      time: "11:00",
      place: "Table-banking groups, Nkubu",
      kind: "Meeting",
      why: "32 groups in the county's biggest constituency. Their leaders are your organisers.",
    },
    {
      time: "14:00",
      place: "Funeral, Mikinduri",
      kind: "Funeral",
      why: "About 1,200 mourners. Arrive early, speak briefly, stay for the meal.",
    },
    {
      time: "17:30",
      place: "Youth fellowship, Timau",
      kind: "Church",
      why: "Young men are your weakest group; this is where they are organised.",
    },
  ],
  watch: [
    {
      level: "high",
      kind: "Misinformation",
      title: "Voice note claims the women's group grants need a party card",
      detail:
        "Circulating in about 30 chama WhatsApp groups in Tigania. Two lines from you, with the group leaders beside you, end it.",
    },
    {
      level: "medium",
      kind: "Weather",
      title: "The dry spell may widen water rationing to Nkubu and Timau",
      detail: "Be seen at a water point the day it starts, with a plan, not a promise.",
    },
    {
      level: "low",
      kind: "IEBC",
      title: "Voter registration drive: 23 days left (demo dates)",
      detail: "Many 18–25s in Meru are not registered. Each ward coordinator has a target.",
    },
    {
      level: "low",
      kind: "Money",
      title: "Spending: 12% of the limit",
      detail: "KES 9.8M of the gazetted KES 80.0M. Keep the reserve for agents.",
    },
  ],
  night: {
    seed: 1203,
    swing: { us: 2 },
    forms: { station: "Form 39A", levels: ["39B · constituency", "39C · county"] },
    incidents: [
      {
        at: "18:15",
        severity: "SEV-3",
        title: "Late start at 4 stations",
        area: "Igembe North",
        detail: "Materials came late on the wet roads; voting extended 45 minutes.",
        status: "Logged",
      },
      {
        at: "19:40",
        severity: "SEV-2",
        title: "Agent turned away from a count",
        area: "Tigania East",
        detail: "Back in with the presiding officer's letter at 20:05.",
        status: "Resolved 20:05",
      },
      {
        at: "21:30",
        severity: "SEV-3",
        title: "Power cut at a tally centre",
        area: "North Imenti",
        detail: "Generator on; tallying continues.",
        status: "Monitoring",
      },
    ],
    divergence: {
      at: "01:05",
      area: "Igembe Central",
      detail:
        "The portal shows 318 more votes for the incumbent at 2 stations than our photographed 39As. Sent for review.",
    },
  },
  ops: {
    seed: 1238,
    sureShare: 0.57,
    foundLastWeek: 3_900,
    doors: { lastWeek: 21_000, plan: 26_000 },
    volunteers: { active: 1_140, newLastWeek: 85 },
    contacts: { optedIn: 142_000, newLastWeek: 3_100, optedOutLastWeek: 120 },
    agents: { recruited: 0.61, trained: 0.5, confirmed: 0.74 },
    money: {
      raised: 24_500_000,
      spent: 9_800_000,
      // The gazetted limit for Meru's county seats (Kenya Gazette Notice 12251, 7 August 2026).
      limit: 80_000_292,
      cash: 11_900_000,
      burnPerWeek: 620_000,
      pledged: 6_200_000,
      categories: [
        { label: "Field and transport", kes: 3_100_000 },
        { label: "Media and ads", kes: 2_200_000 },
        { label: "Events and rallies", kes: 1_900_000 },
        { label: "Staff", kes: 1_400_000 },
        { label: "Digital and SMS", kes: 800_000 },
        { label: "Other", kes: 400_000 },
      ],
    },
    coordinatorRole: "Ward coordinator",
    needs: [
      {
        label: "5 expenses waiting for approval",
        detail: "KES 412,000 · transport and hall hire for Saturday's Igembe women's meetings",
        action: { kind: "go", label: "Review", to: "/finance" },
      },
      {
        label: "Broadcast drafted: the sanitary-pad drive",
        detail: "Saturday's schools, to opted-in supporters in all nine constituencies",
        action: { kind: "go", label: "Check and send", to: "/broadcast" },
      },
      {
        label: "41 replies waiting",
        detail: "Mostly about water and the miraa price",
        action: { kind: "go", label: "Reply", to: "/inbox" },
      },
    ],
  },
};
