// Demo: an MP's campaign in Mathira. The candidate is fictional and every
// figure is invented. Rivals are placeholders.

import type { AreaModel, Scenario } from "@/lib/demo/types";

// slug, name, registered, our share, Challenger A, Challenger B, turnout 2027,
// turnout 2022, our side's 2022 share, hours to results
type Row = [string, string, number, number, number, number, number, number, number, number];

const ROWS: Row[] = [
  ["karatina-town", "Karatina Town", 17_400, 52, 36, 12, 0.72, 0.74, 34, 0.4],
  ["konyu", "Konyu", 16_200, 48, 40, 12, 0.75, 0.78, 31, 0.8],
  ["ruguru", "Ruguru", 21_300, 46, 42, 12, 0.74, 0.77, 29, 1],
  ["iriaini", "Iriaini", 17_100, 44, 44, 12, 0.75, 0.78, 28, 0.9],
  ["magutu", "Magutu", 18_900, 44, 45, 11, 0.76, 0.79, 27, 0.7],
  ["kirimukuyu", "Kirimukuyu", 19_600, 42, 47, 11, 0.76, 0.79, 26, 0.6],
];

const areas: AreaModel[] = ROWS.map(
  ([slug, name, registered, us, a, b, turnout, turnout2022, us2022, lag]) => ({
    slug,
    name,
    group: "Mathira",
    registered,
    shares: { us, a, b },
    turnout,
    turnout2022,
    us2022,
    lag,
  }),
);

export const mathira: Scenario = {
  key: "mathira",
  office: "mp",
  officeLabel: "Member of Parliament",
  seat: "Mathira Constituency, Nyeri County",
  candidate: {
    name: "Njeri Mwangi",
    first: "Njeri",
    initials: "NM",
    party: "Regional party",
    fictional: true,
  },
  contenders: [
    { key: "us", name: "Njeri Mwangi", party: "Regional party", tone: "us", us: true },
    { key: "a", name: "Challenger A", party: "National party", tone: "a" },
    { key: "b", name: "Challenger B", party: "Independent", tone: "b" },
  ],
  geo: { file: "/geo/mathira-wards.json", unit: "ward", units: "wards", group: "Ward" },
  areas,
  winNumber: { target: 38_000, found: 24_610 },
  today: [
    {
      title: "Get ahead of the coffee story",
      detail:
        "Challenger A owned it last night with a promise. A meeting with a payment date beats a promise, and only the MP can call everyone into one room.",
      action: {
        kind: "task",
        label: "Call the society chair",
        task: "Call the coffee society chair before 09:00 about Friday's meeting",
      },
    },
    {
      title: "Be at the Konyu funeral before 3pm",
      detail:
        "About 2,000 mourners. Challenger A arrives at 3. Arrive first, speak briefly, stay for the meal: that's what people remember.",
      action: { kind: "task", label: "Block 14:00–17:00", task: "Konyu funeral, arrive 14:15" },
    },
    {
      title: "Announce the bursary cheques for Monday",
      detail:
        "1,240 students and their parents in every ward. It's the best visibility moment of the month, and it's good news.",
      action: {
        kind: "draft",
        label: "Draft the announcement",
        title: "Bursary cheques on Monday",
        body: "Bursary cheques for 1,240 students from all six wards of Mathira are ready. Parents and guardians can collect them on Monday from 9am at the ward offices. Please bring the student's admission letter and your ID. Congratulations to every student: Mathira is behind you.",
      },
    },
  ],
  story: {
    tag: "Local",
    kicker: "Coffee · Kirimukuyu and Magutu",
    headline: "Coffee society delays the September payout by three weeks",
    summary:
      "The society blames a late payment from the miller. About 9,800 farming households in Mathira had expected KES 42 a kilo this week.",
    numbers: [
      { value: "9,800", label: "farming households waiting to be paid" },
      { value: "46%", label: "of your voters live in farming households" },
      { value: "31%", label: "name coffee and tea payments as their first issue" },
    ],
    rivals:
      'Challenger A promised a "coffee fund" at a funeral in Konyu yesterday. Challenger B hasn\'t spoken.',
    line: "Don't promise a fund an MP can't create. Offer what you can do this week: bring the society, the miller and the county agriculture officer together on Friday, and publish the date farmers will be paid.",
    actions: [
      {
        kind: "poll",
        label: "Ask farmers when they were paid",
        ask: "When were you last paid for your coffee?",
      },
      {
        kind: "draft",
        label: "Draft Friday's invitation",
        title: "Invitation: coffee payments meeting",
        body: "Mathira's coffee farmers are owed their September payment. I am inviting the society's management, the miller and the county agriculture office to meet on Friday at 10am at the Karatina social hall, with farmers' representatives from every ward. We will leave with a payment date and publish it the same day.",
      },
    ],
    source: "Farmers' SMS replies and society notice (demo)",
    time: "06:10",
  },
  news: [
    {
      tag: "Economy",
      headline: "Tea factories announce second payments next month",
      soWhat: "Good news in Iriaini and Ruguru. Be there when the cheques land.",
      source: "Factory notices (demo)",
      time: "Yesterday",
    },
    {
      tag: "Local",
      headline: "Karatina Town traders protest new county parking charges",
      soWhat:
        "Your strongest ward (52 to 36). Don't lose the traders over a county fee: ask the county to phase it.",
      source: "Traders' association",
      time: "07:20",
      action: {
        kind: "poll",
        label: "Ask traders",
        ask: "Should the new parking charges in Karatina be phased in over a year?",
      },
    },
    {
      tag: "Opponent",
      headline: "Challenger A's youth rally draws about 600 in Karatina",
      soWhat:
        "His machine is young men on bodas; yours is chamas and churches. Both turn out, if asked.",
      source: "Ward coordinator report",
      time: "Yesterday 18:40",
    },
    {
      tag: "Party",
      headline: "Your party confirms the Mathira nomination by consensus",
      soWhat:
        "No primary means no bruises. Put the money you saved into agents for all 230 stations.",
      source: "Party branch",
      time: "Yesterday 20:00",
    },
    {
      tag: "Security",
      headline: "Chiefs step up the crackdown on illicit brews in Iriaini",
      soWhat:
        "Mothers' groups back it. Say so at Sunday's service, behind them rather than the police.",
      source: "Chief's baraza (demo)",
      time: "06:45",
    },
  ],
  polls: {
    average: [
      { week: "10 Jul", shares: { us: 32, a: 35, b: 9, undecided: 24 } },
      { week: "17 Jul", shares: { us: 32, a: 35, b: 9, undecided: 24 } },
      { week: "24 Jul", shares: { us: 33, a: 35, b: 9, undecided: 23 } },
      { week: "31 Jul", shares: { us: 33, a: 34, b: 10, undecided: 23 } },
      { week: "7 Aug", shares: { us: 34, a: 34, b: 10, undecided: 22 } },
      { week: "14 Aug", shares: { us: 34, a: 34, b: 10, undecided: 22 } },
      { week: "21 Aug", shares: { us: 35, a: 34, b: 9, undecided: 22 } },
      { week: "28 Aug", shares: { us: 35, a: 33, b: 9, undecided: 23 } },
      { week: "4 Sep", shares: { us: 36, a: 33, b: 9, undecided: 22 } },
      { week: "11 Sep", shares: { us: 36, a: 33, b: 9, undecided: 22 } },
      { week: "18 Sep", shares: { us: 36, a: 34, b: 9, undecided: 21 } },
      { week: "25 Sep", shares: { us: 36, a: 33, b: 9, undecided: 22 } },
    ],
    own: {
      date: "20–23 Sep",
      method: "USSD and SMS panel, with door-to-door interviews, weighted by ward",
      n: 640,
      moe: 3.9,
      question: "If the MP election were held today, who would you vote for?",
      shares: { us: 36, a: 33, b: 9, undecided: 22 },
    },
    outside: [
      {
        pollster: "Pollster A",
        date: "12 Sep",
        n: 400,
        shares: { us: 34, a: 36, b: 10, undecided: 20 },
      },
    ],
    crosstabs: [
      { group: "Women 35+", us: 44, rival: 31, note: "Chamas and churches: your strongest group." },
      {
        group: "Men 18–30",
        us: 27,
        rival: 43,
        note: "Challenger A's bodas. Turnout is the question.",
      },
      { group: "Coffee farmers", us: 35, rival: 39, note: "The payout delay is costing you." },
      { group: "Karatina traders", us: 49, rival: 30, note: "Keep them on the parking charges." },
    ],
    ideas: [
      "When were you last paid for your coffee?",
      "Which road should be graded first before the rains?",
      "Would you come to a jobs fair in Karatina?",
    ],
  },
  opponents: [
    {
      key: "a",
      yesterday: "The Konyu funeral (spoke for 12 minutes), then a youth rally in Karatina.",
      message: "A coffee fund, and jobs for boda riders.",
      voice: 44,
      spend: "≈ KES 180,000 this week (estimate)",
      threat: "high",
      watch: "He is at the Magutu women's group meeting on Saturday. Send your chama coordinator.",
    },
    {
      key: "b",
      yesterday: "Door to door in Ruguru with 12 volunteers.",
      message: "Clean politics; fix the feeder roads.",
      voice: 14,
      spend: "Low",
      threat: "low",
      watch: "Splitting the vote in Ruguru; he takes more from Challenger A than from you.",
    },
  ],
  voters: {
    issues: [
      { label: "Coffee & tea payments", share: 31, change: 5, hot: "Kirimukuyu, Magutu" },
      { label: "Roads", share: 19, change: 2, hot: "Ruguru, Iriaini" },
      { label: "Jobs for young people", share: 16, change: 0, hot: "Karatina Town" },
      { label: "Alcohol & drugs", share: 11, change: 1, hot: "Iriaini, Konyu" },
      { label: "Bursaries", share: 9, change: 2, hot: "Every ward" },
      { label: "Health", share: 7, change: -1, hot: "Karatina Town" },
    ],
    groups: [
      { label: "Coffee & tea farmers", size: "34,000 voters", move: -3, note: "Payout delays." },
      {
        label: "Chama women",
        size: "18,000",
        move: 2,
        note: "Your organisers; they want bursaries and safety.",
      },
      { label: "Boda riders", size: "4,500", move: -2, note: "Challenger A's messengers." },
      { label: "Karatina traders", size: "6,800", move: 1, note: "Parking charges." },
    ],
    quotes: [
      {
        text: "Tumesubiri malipo ya kahawa tangu Julai.",
        translation: "We've waited for the coffee payment since July.",
        who: "Farmer, 61",
        where: "Kirimukuyu · SMS reply",
      },
      {
        text: "Barabara yetu inapitika tu wakati wa jua.",
        translation: "Our road is only passable when it's dry.",
        who: "Woman, 45",
        where: "Ruguru · canvass note",
      },
      {
        text: "Give the boys work and the drinking goes down.",
        who: "Man, 52",
        where: "Iriaini · USSD poll",
      },
    ],
    persuadables: {
      count: 14_200,
      note: "Undecided or soft. 61% live in farming households in Kirimukuyu and Magutu.",
    },
  },
  lastTime: {
    title: "2022 MP election, Mathira (illustrative)",
    official: false,
    source: "Illustrative figures for the demo",
    results: [
      { name: "Winner, 2022", votes: 58_400, share: 71.2 },
      { name: "Runner-up", votes: 17_900, share: 21.8 },
      { name: "Others", votes: 5_700, share: 7 },
    ],
    turnout: 0.77,
    lessons: [
      "2022 was a party wave: the winner took every ward.",
      "Turnout was among the highest in the country, so a low-turnout surprise is unlikely. Persuasion wins this, not mobilisation.",
      "This time there's no wave. The undecided decide it, and most of them farm.",
    ],
  },
  diary: [
    {
      time: "07:00",
      place: "Karatina market",
      kind: "Market",
      why: "Market day: walk the traders' lines before the crowds.",
    },
    {
      time: "09:00",
      place: "Call the coffee society chair",
      kind: "Meeting",
      why: "Set up Friday's meeting before Challenger A calls.",
    },
    {
      time: "11:30",
      place: "Tea buying centre, Iriaini",
      kind: "Visit",
      why: "Farmers are there for the weigh-in; talk about the second payment.",
    },
    {
      time: "14:15",
      place: "Funeral, Konyu",
      kind: "Funeral",
      why: "About 2,000 mourners. Arrive before Challenger A; speak briefly; stay for the meal.",
    },
    {
      time: "17:30",
      place: "Youth fellowship, Ruguru",
      kind: "Church",
      why: "Young men are your weakest group; this is where they're organised.",
    },
  ],
  watch: [
    {
      level: "high",
      kind: "Misinformation",
      title: "Voice note claims you'll sell the society's land",
      detail:
        "Circulating in 30 Kirimukuyu WhatsApp groups. Two lines from you, with the society chair beside you, end it.",
    },
    {
      level: "medium",
      kind: "Weather",
      title: "Rain washes out feeder roads in Ruguru",
      detail:
        "Farmers can't get cherry to the factory. A call to the county roads office, and a visit, is a visible fix.",
    },
    {
      level: "medium",
      kind: "Security",
      title: "Illicit brew crackdown",
      detail:
        "Chiefs raided 14 dens this week. Keep your statements behind the mothers' groups, not the police.",
    },
    {
      level: "low",
      kind: "IEBC",
      title: "Voter registration drive: 23 days left (demo dates)",
      detail: "3,100 unregistered 18–25s in Mathira. Each ward coordinator has a target.",
    },
    {
      level: "low",
      kind: "Money",
      title: "Spending: 6% of the legal limit",
      detail: "KES 2.1M so far. Keep the reserve for agents.",
    },
  ],
  night: {
    seed: 35,
    swing: { us: 1.8 },
    forms: { station: "Form 35A", levels: ["35B · constituency"] },
    incidents: [
      {
        at: "18:10",
        severity: "SEV-3",
        title: "Late start at 2 stations",
        area: "Ruguru",
        detail: "Rain delayed the materials; voting extended 40 minutes.",
        status: "Logged",
      },
      {
        at: "19:35",
        severity: "SEV-2",
        title: "Agent turned away from a count",
        area: "Kirimukuyu",
        detail: "Back in with the presiding officer's letter at 19:55.",
        status: "Resolved 19:55",
      },
      {
        at: "21:10",
        severity: "SEV-3",
        title: "Crowd at the tally centre",
        area: "Karatina Town",
        detail: "Calm; police present.",
        status: "Monitoring",
      },
    ],
    divergence: {
      at: "21:50",
      area: "Magutu",
      detail:
        "The portal shows 96 more votes for Challenger A at one station than our photographed 35A. Sent for review.",
    },
  },
};
