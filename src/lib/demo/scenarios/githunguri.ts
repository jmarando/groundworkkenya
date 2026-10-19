// Demo: an MP's campaign in Githunguri, Kiambu County. The five wards and their map are real
// (public/geo/githunguri-wards.json, geoBoundaries); the candidate is fictional, every figure is
// invented (registered voters too) and rivals are placeholders.

import type { AreaModel, Scenario } from "@/lib/demo/types";

// slug, name, registered, our share, Challenger A, Challenger B, turnout 2027,
// turnout 2022, our side's 2022 share, hours to results
type Row = [string, string, number, number, number, number, number, number, number, number];

const ROWS: Row[] = [
  ["githunguri", "Githunguri", 24_800, 48, 40, 12, 0.7, 0.72, 36, 0.5],
  ["githiga", "Githiga", 22_100, 46, 42, 12, 0.72, 0.74, 34, 0.8],
  ["ikinu", "Ikinu", 17_600, 43, 45, 12, 0.73, 0.76, 29, 0.9],
  ["ngewa", "Ngewa", 18_300, 44, 45, 11, 0.74, 0.76, 28, 0.7],
  ["komothai", "Komothai", 21_200, 42, 47, 11, 0.74, 0.77, 27, 1],
];

const areas: AreaModel[] = ROWS.map(
  ([slug, name, registered, us, a, b, turnout, turnout2022, us2022, lag]) => ({
    slug,
    name,
    group: "Githunguri",
    registered,
    shares: { us, a, b },
    turnout,
    turnout2022,
    us2022,
    lag,
  }),
);

export const githunguri: Scenario = {
  key: "githunguri",
  office: "mp",
  officeLabel: "Member of Parliament",
  seat: "Githunguri Constituency, Kiambu County",
  candidate: {
    name: "Wairimu Njoroge",
    first: "Wairimu",
    initials: "WN",
    party: "National party",
    fictional: true,
  },
  contenders: [
    {
      key: "us",
      name: "Wairimu Njoroge",
      short: "Wairimu",
      party: "National party",
      tone: "us",
      us: true,
    },
    { key: "a", name: "Challenger A", short: "Challenger A", party: "Regional party", tone: "a" },
    { key: "b", name: "Challenger B", short: "Challenger B", party: "Independent", tone: "b" },
  ],
  geo: { file: "/geo/githunguri-wards.json", unit: "ward", units: "wards", group: "Ward" },
  areas,
  winNumber: { target: 36_000, found: 22_940 },
  today: [
    {
      title: "Get ahead of the milk price story",
      detail:
        "The dairy's buying price dropped by KES 3 a litre this week (demo). Challenger A owned it last night with a promise. A meeting with the dairy's board and a date beats a promise.",
      action: {
        kind: "task",
        label: "Call the dairy chair",
        task: "Call the dairy board chair before 09:00 about Friday's farmers' meeting",
      },
    },
    {
      title: "Be at the Komothai funeral before 3pm",
      detail:
        "About 1,500 mourners. Komothai is your weakest ward (42 to 47). Arrive first, speak briefly, stay for the meal.",
      action: { kind: "task", label: "Block 14:00–17:00", task: "Komothai funeral, arrive 14:15" },
    },
    {
      title: "Announce the bursary cheques for Monday",
      detail:
        "1,180 students and their parents in every ward (demo). The best visibility moment of the month, and it's good news.",
      action: {
        kind: "draft",
        label: "Draft the announcement",
        title: "Bursary cheques on Monday",
        body: "Bursary cheques for 1,180 students from all five wards of Githunguri are ready. Parents and guardians can collect them on Monday from 9am at the ward offices. Please bring the student's admission letter and your ID. Congratulations to every student: Githunguri is behind you.",
      },
    },
  ],
  story: {
    tag: "Local",
    kicker: "Dairy · Komothai and Ngewa",
    headline: "Dairy cuts the milk buying price by KES 3 a litre",
    summary:
      "The dairy blames cheaper milk powder imports. Farmers in Komothai and Ngewa, who deliver most of their milk there, say the cut wipes out their margin (demo).",
    numbers: [
      { value: "KES 3", label: "less a litre from this week" },
      { value: "41%", label: "of your voters live in dairy households" },
      { value: "34%", label: "name milk prices as their first issue" },
    ],
    rivals:
      'Challenger A promised a "milk price floor" at a funeral in Komothai yesterday. Challenger B hasn\'t spoken.',
    line: "Don't promise a price an MP can't set. Offer what you can do this week: bring the dairy's board, farmers' representatives and the county livestock office together on Friday, and publish what comes out of it.",
    actions: [
      {
        kind: "poll",
        label: "Ask farmers their price",
        ask: "What were you paid a litre for milk this week?",
      },
      {
        kind: "draft",
        label: "Draft Friday's invitation",
        title: "Invitation: milk prices meeting",
        body: "Githunguri's dairy farmers have had their milk price cut. I am inviting the dairy's board and the county livestock office to meet on Friday at 10am at Githunguri town, with farmers' representatives from every ward. We will leave with a plan and publish it the same day.",
      },
    ],
    source: "Farmers' SMS replies and dairy notice (demo)",
    time: "06:10",
  },
  news: [
    {
      tag: "Economy",
      headline: "Tea factories announce second payments next month",
      soWhat: "Good news in Githiga and Komothai. Be there when the payments land.",
      source: "Factory notices (demo)",
      time: "Yesterday",
    },
    {
      tag: "Local",
      headline: "Githunguri town traders protest new county market fees",
      soWhat:
        "Your strongest ward (48 to 40). Don't lose the traders over a county fee: ask the county to phase it.",
      source: "Traders' association (demo)",
      time: "07:20",
      action: {
        kind: "poll",
        label: "Ask traders",
        ask: "Should the new market fees in Githunguri town be phased in over a year?",
      },
    },
    {
      tag: "Opponent",
      headline: "Challenger A's youth rally draws about 500 in Ikinu",
      soWhat:
        "His machine is young men on bodas; yours is chamas and churches. Both turn out, if asked.",
      source: "Ward coordinator report (demo)",
      time: "Yesterday 18:40",
    },
    {
      tag: "Security",
      headline: "Chiefs step up the crackdown on illicit brews in Ngewa",
      soWhat:
        "Mothers' groups back it. Say so at Sunday's service, behind them rather than the police.",
      source: "Chief's baraza (demo)",
      time: "06:45",
    },
  ],
  polls: {
    average: [
      { week: "10 Jul", shares: { us: 33, a: 35, b: 9, undecided: 23 } },
      { week: "17 Jul", shares: { us: 33, a: 35, b: 9, undecided: 23 } },
      { week: "24 Jul", shares: { us: 34, a: 35, b: 9, undecided: 22 } },
      { week: "31 Jul", shares: { us: 34, a: 34, b: 10, undecided: 22 } },
      { week: "7 Aug", shares: { us: 35, a: 34, b: 10, undecided: 21 } },
      { week: "14 Aug", shares: { us: 35, a: 34, b: 9, undecided: 22 } },
      { week: "21 Aug", shares: { us: 36, a: 34, b: 9, undecided: 21 } },
      { week: "28 Aug", shares: { us: 36, a: 33, b: 9, undecided: 22 } },
      { week: "4 Sep", shares: { us: 37, a: 33, b: 9, undecided: 21 } },
      { week: "11 Sep", shares: { us: 37, a: 33, b: 9, undecided: 21 } },
      { week: "18 Sep", shares: { us: 37, a: 34, b: 9, undecided: 20 } },
      { week: "25 Sep", shares: { us: 37, a: 33, b: 9, undecided: 21 } },
    ],
    own: {
      date: "20–23 Sep",
      method: "SMS panel, with door-to-door interviews, weighted by ward",
      n: 600,
      moe: 4,
      question: "If the MP election were held today, who would you vote for?",
      shares: { us: 37, a: 33, b: 9, undecided: 21 },
    },
    outside: [
      {
        pollster: "Pollster A",
        date: "12 Sep",
        n: 400,
        shares: { us: 35, a: 36, b: 10, undecided: 19 },
      },
    ],
    crosstabs: [
      { group: "Women 35+", us: 45, rival: 30, note: "Chamas and churches: your strongest group." },
      {
        group: "Men 18–30",
        us: 28,
        rival: 42,
        note: "Challenger A's bodas. Turnout is the question.",
      },
      { group: "Dairy farmers", us: 34, rival: 40, note: "The milk price cut is costing you." },
      {
        group: "Githunguri town traders",
        us: 50,
        rival: 31,
        note: "Keep them on the market fees.",
      },
    ],
    ideas: [
      "What were you paid a litre for milk this week?",
      "Which road should be graded first before the rains?",
      "Would you come to a jobs fair in Githunguri town?",
    ],
  },
  opponents: [
    {
      key: "a",
      yesterday: "The Komothai funeral (spoke for 15 minutes), then a youth rally in Ikinu.",
      message: "A milk price floor, and jobs for boda riders.",
      voice: 45,
      spend: "≈ KES 170,000 this week (estimate)",
      threat: "high",
      watch: "He is at the Ngewa women's group meeting on Saturday. Send your chama coordinator.",
    },
    {
      key: "b",
      yesterday: "Door to door in Githiga with 10 volunteers.",
      message: "Clean politics; fix the feeder roads.",
      voice: 13,
      spend: "Low",
      threat: "low",
      watch: "Splitting the vote in Githiga; he takes more from Challenger A than from you.",
    },
  ],
  voters: {
    issues: [
      { label: "Milk prices", share: 34, change: 6, hot: "Komothai, Ngewa" },
      { label: "Roads", share: 18, change: 2, hot: "Ikinu, Githiga" },
      { label: "Jobs for young people", share: 15, change: 0, hot: "Githunguri town" },
      { label: "Tea & coffee payments", share: 12, change: 1, hot: "Githiga, Komothai" },
      { label: "Alcohol & drugs", share: 10, change: 1, hot: "Ngewa" },
      { label: "Bursaries", share: 8, change: 2, hot: "Every ward" },
    ],
    groups: [
      { label: "Dairy farmers", size: "38,000 voters", move: -3, note: "The price cut." },
      {
        label: "Chama women",
        size: "17,000",
        move: 2,
        note: "Your organisers; they want bursaries and safety.",
      },
      { label: "Boda riders", size: "4,200", move: -2, note: "Challenger A's messengers." },
      { label: "Githunguri town traders", size: "6,100", move: 1, note: "Market fees." },
    ],
    quotes: [
      {
        text: "Bei ya maziwa imeshuka tena.",
        translation: "The milk price has dropped again.",
        who: "Farmer, 58",
        where: "Komothai · SMS reply",
      },
      {
        text: "Barabara yetu inapitika tu wakati wa jua.",
        translation: "Our road is only passable when it's dry.",
        who: "Woman, 44",
        where: "Ikinu · canvass note",
      },
      {
        text: "Give the boys work and the drinking goes down.",
        who: "Man, 50",
        where: "Ngewa · SMS poll",
      },
    ],
    persuadables: {
      count: 13_600,
      note: "Undecided or soft. Most live in dairy households in Komothai and Ngewa.",
    },
  },
  lastTime: {
    title: "2017 MP election, Githunguri",
    official: true,
    source: "IEBC declared results, via BallotWinners (86,306 valid votes)",
    results: [
      { name: "Gabriel Kago Mukuha (Jubilee)", votes: 76_906, share: 89.1 },
      { name: "Francis Mburu Machua (NARC-Kenya)", votes: 5_611, share: 6.5 },
      { name: "Six others", votes: 3_789, share: 4.4 },
    ],
    turnout: null,
    lessons: [
      "2017 was a Jubilee wave. In 2022 Wamuchomba took the seat from Kago 34,646 to 31,127, a 3,519 margin, while Ruto carried the constituency comfortably: many voters split their ticket.",
      "Farm economics beats party loyalty here: the dairy co-operative, tea factories and coffee societies are where the votes are argued over.",
      "Turnout stays high, so persuasion wins this, not mobilisation (team research).",
    ],
  },
  diary: [
    {
      time: "07:00",
      place: "Milk collection centre, Komothai",
      kind: "Visit",
      why: "Farmers are there for the morning delivery; talk about the price.",
    },
    {
      time: "09:00",
      place: "Call the dairy board chair",
      kind: "Meeting",
      why: "Set up Friday's meeting before Challenger A calls.",
    },
    {
      time: "11:30",
      place: "Githunguri town market",
      kind: "Market",
      why: "Market day: walk the traders' lines before the crowds.",
    },
    {
      time: "14:15",
      place: "Funeral, Komothai",
      kind: "Funeral",
      why: "About 1,500 mourners. Arrive before Challenger A; speak briefly; stay for the meal.",
    },
    {
      time: "17:30",
      place: "Youth fellowship, Ikinu",
      kind: "Church",
      why: "Young men are your weakest group; this is where they're organised.",
    },
  ],
  watch: [
    {
      level: "high",
      kind: "Misinformation",
      title: "Voice note claims you'll sell the dairy's land",
      detail:
        "Circulating in 25 Komothai WhatsApp groups. Two lines from you, with farmers' leaders beside you, end it.",
    },
    {
      level: "medium",
      kind: "Weather",
      title: "Rain washes out feeder roads in Ikinu",
      detail:
        "Farmers can't get milk to the collection centres. A call to the county roads office, and a visit, is a visible fix.",
    },
    {
      level: "low",
      kind: "IEBC",
      title: "Voter registration drive: 23 days left (demo dates)",
      detail: "2,900 unregistered 18–25s in Githunguri. Each ward coordinator has a target.",
    },
    {
      level: "low",
      kind: "Money",
      title: "Spending: 40% of the limit",
      detail: "KES 8.3M of the gazetted KES 20.56M. Keep the reserve for agents.",
    },
  ],
  night: {
    seed: 37,
    swing: { us: 1.5 },
    forms: { station: "Form 35A", levels: ["35B · constituency"] },
    incidents: [
      {
        at: "18:10",
        severity: "SEV-3",
        title: "Late start at 2 stations",
        area: "Ikinu",
        detail: "Rain delayed the materials; voting extended 40 minutes.",
        status: "Logged",
      },
      {
        at: "19:35",
        severity: "SEV-2",
        title: "Agent turned away from a count",
        area: "Komothai",
        detail: "Back in with the presiding officer's letter at 19:55.",
        status: "Resolved 19:55",
      },
      {
        at: "21:10",
        severity: "SEV-3",
        title: "Crowd at the tally centre",
        area: "Githunguri",
        detail: "Calm; police present.",
        status: "Monitoring",
      },
    ],
    divergence: {
      at: "21:50",
      area: "Ngewa",
      detail:
        "The portal shows 96 more votes for Challenger A at one station than our photographed 35A. Sent for review.",
    },
  },
  ops: {
    seed: 3711,
    sureShare: 0.6,
    foundLastWeek: 240,
    doors: { lastWeek: 2_900, plan: 3_800 },
    volunteers: { active: 138, newLastWeek: 11 },
    contacts: { optedIn: 17_600, newLastWeek: 390, optedOutLastWeek: 21 },
    agents: { recruited: 0.7, trained: 0.6, confirmed: 0.79 },
    money: {
      raised: 14_600_000,
      spent: 8_300_000,
      // The gazetted limit for an MP in Githunguri (Kenya Gazette Notice 12251, 7 August 2026).
      limit: 20_560_428,
      cash: 6_300_000,
      burnPerWeek: 420_000,
      pledged: 2_600_000,
      categories: [
        { label: "Field and transport", kes: 2_800_000 },
        { label: "Media and ads", kes: 1_900_000 },
        { label: "Events and rallies", kes: 1_600_000 },
        { label: "Staff", kes: 1_200_000 },
        { label: "Digital and SMS", kes: 500_000 },
        { label: "Other", kes: 300_000 },
      ],
    },
    coordinatorRole: "Ward coordinator",
    needs: [
      {
        label: "3 expenses waiting for approval",
        detail: "KES 386,000 · fuel and hall hire for Saturday's Komothai meeting",
        action: { kind: "go", label: "Review", to: "/finance" },
      },
      {
        label: "Broadcast drafted: Githunguri market day",
        detail: "Thursday's walkabout, to opted-in supporters in Githunguri and Githiga",
        action: { kind: "go", label: "Check and send", to: "/broadcast" },
      },
      {
        label: "12 replies waiting",
        detail: "Mostly about the milk price",
        action: { kind: "go", label: "Reply", to: "/inbox" },
      },
    ],
  },
};
