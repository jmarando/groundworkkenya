// Demo: an MCA's campaign in Athwana ward, Tigania West, Meru County. The ward's outline and its
// fourteen polling centres with their registered voters are real (public/geo/athwana-wards.json;
// IEBC's 2022 register, data/stations/athwana.csv); the candidate is fictional, every other
// figure is invented and rivals are placeholders. No centre has a known position yet, so each
// is in the tables and the map shows the ward alone.

import type { AreaModel, Scenario } from "@/lib/demo/types";

// slug, name, registered, our share, Challenger A, Challenger B, turnout 2027,
// turnout 2022, our side's 2022 share, hours to results
type Row = [string, string, number, number, number, number, number, number, number, number];

const ROWS: Row[] = [
  ["ps-0001", "Limoro Primary School", 1_144, 46, 41, 13, 0.79, 0.81, 33, 1.4],
  ["ps-0002", "Maitha Primary School", 816, 43, 44, 13, 0.8, 0.82, 31, 1.6],
  ["ps-0003", "Mwanika Primary School", 1_216, 48, 39, 13, 0.78, 0.8, 34, 1.2],
  ["ps-0004", "Kibiru Primary School", 798, 41, 46, 13, 0.81, 0.83, 29, 1.8],
  ["ps-0005", "Mweronkoro Primary School", 481, 44, 43, 13, 0.8, 0.82, 32, 1.9],
  ["ps-0006", "K.K Nkengechia Primary School", 446, 40, 47, 13, 0.82, 0.84, 28, 2],
  ["ps-0007", "Twarama Kenya Assembly of God Nursery School", 729, 45, 42, 13, 0.79, 0.81, 33, 1.7],
  ["ps-0008", "Laciathuriu Primary School", 519, 42, 45, 13, 0.81, 0.83, 30, 1.9],
  ["ps-0009", "Athwana Secondary School", 972, 50, 37, 13, 0.77, 0.79, 36, 1],
  ["ps-0010", "Kamanoro Primary School", 644, 44, 43, 13, 0.8, 0.82, 32, 1.5],
  ["ps-0011", "Nkiluthu Primary School", 686, 43, 44, 13, 0.8, 0.82, 31, 1.6],
  ["ps-0012", "Kadebene Livestock Market", 113, 38, 49, 13, 0.83, 0.85, 27, 2.2],
  ["ps-0013", "Muluta Dispensary", 398, 46, 41, 13, 0.79, 0.81, 33, 1.8],
  ["ps-0014", "Kiare Primary School", 161, 41, 46, 13, 0.82, 0.84, 29, 2.1],
];

const areas: AreaModel[] = ROWS.map(
  ([slug, name, registered, us, a, b, turnout, turnout2022, us2022, lag]) => ({
    slug,
    name,
    group: "Athwana",
    registered,
    shares: { us, a, b },
    turnout,
    turnout2022,
    us2022,
    lag,
    offMap: true as const,
  }),
);

export const athwana: Scenario = {
  key: "athwana",
  office: "mca",
  officeLabel: "Member of County Assembly",
  seat: "Athwana Ward, Tigania West, Meru County",
  candidate: {
    name: "Kendi Mwiti",
    first: "Kendi",
    initials: "KM",
    party: "National party",
    fictional: true,
  },
  contenders: [
    {
      key: "us",
      name: "Kendi Mwiti",
      short: "Kendi",
      party: "National party",
      tone: "us",
      us: true,
    },
    { key: "a", name: "Challenger A", short: "Challenger A", party: "Regional party", tone: "a" },
    { key: "b", name: "Challenger B", short: "Challenger B", party: "Independent", tone: "b" },
  ],
  geo: {
    file: "/geo/athwana-wards.json",
    unit: "polling centre",
    units: "polling centres",
    group: "Polling centre",
  },
  areas,
  winNumber: { target: 3_200, found: 1_870 },
  today: [
    {
      title: "Be at Kadebene livestock market when it opens",
      detail:
        "Market day draws herders from across the ward. Kadebene is your weakest centre (38 to 49): a morning on the market floor is worth a week of meetings.",
      action: {
        kind: "task",
        label: "Block 06:30–09:00",
        task: "Kadebene livestock market, 06:30",
      },
    },
    {
      title: "Answer the water question in Kibiru",
      detail:
        "The borehole at Kibiru has been down for two weeks (demo). Residents are asking who will fix it. Say what the ward office will do, and when.",
      action: {
        kind: "draft",
        label: "Draft the update",
        title: "The Kibiru borehole",
        body: "Neighbours in Kibiru: I have reported the broken borehole to the county water office and asked for a repair date. I will share it here by Friday. Until then, reply with your village if you need water trucked in, so we can make a full list.",
      },
    },
    {
      title: "Ask families about bursaries before the deadline",
      detail:
        "The county bursary forms close in 9 days (demo date). Every family that applies through you is a family you have helped.",
      action: {
        kind: "poll",
        label: "Ask families",
        ask: "Does anyone in your home need a county bursary form this term?",
      },
    },
  ],
  story: {
    tag: "Local",
    kicker: "Miraa · Athwana and Kianjai",
    headline: "Miraa buyers cut farm-gate prices again",
    summary:
      "Brokers are paying less a bundle this week, blaming slow exports (demo). Farmers in Athwana, who sell most of their miraa through brokers, say the cut wipes out their margin.",
    numbers: [
      { value: "9,123", label: "voters registered in Athwana" },
      { value: "14", label: "polling centres across the ward" },
      { value: "44%", label: "name farm prices as their first issue" },
    ],
    rivals:
      'Challenger A promised a "miraa fund" at a church harambee yesterday. Challenger B hasn\'t spoken.',
    line: "Don't promise a price an MCA can't set. Offer what you can do this week: bring farmers, brokers and the county agriculture office together, and publish what comes out of it.",
    actions: [
      {
        kind: "poll",
        label: "Ask farmers their price",
        ask: "What were you paid for a bundle of miraa this week?",
      },
      {
        kind: "draft",
        label: "Draft the invitation",
        title: "Invitation: miraa prices meeting",
        body: "Athwana's miraa farmers have had their prices cut. I am inviting brokers and the county agriculture office to meet farmers' representatives from every village on Friday at 10am at Athwana Secondary School. We will leave with a plan and publish it the same day.",
      },
    ],
    source: "Farmers' SMS replies and canvass notes (demo)",
    time: "06:10",
  },
  news: [
    {
      tag: "County",
      headline: "County announces the ward development fund allocations",
      soWhat: "Know Athwana's figure before Challenger A quotes it at you.",
      source: "County notice (demo)",
      time: "Yesterday",
    },
    {
      tag: "Local",
      headline: "Rains wash out the murram road to Kiare",
      soWhat: "A visible fix in your smallest centre. Call the county roads office, then visit.",
      source: "Village elder's report (demo)",
      time: "07:20",
    },
    {
      tag: "Opponent",
      headline: "Challenger A hosts a youth football tournament at Maitha",
      soWhat:
        "His base is young men; yours is women's groups and churches. Both turn out, if asked.",
      source: "Centre captain report (demo)",
      time: "Yesterday 18:40",
    },
    {
      tag: "Security",
      headline: "Chief's baraza on cattle theft near the Isiolo boundary",
      soWhat:
        "A worry every herder shares. Be there, and back the chief's plan rather than promise your own.",
      source: "Chief's baraza (demo)",
      time: "06:45",
    },
  ],
  polls: {
    average: [
      { week: "10 Jul", shares: { us: 31, a: 35, b: 10, undecided: 24 } },
      { week: "17 Jul", shares: { us: 32, a: 35, b: 10, undecided: 23 } },
      { week: "24 Jul", shares: { us: 32, a: 34, b: 10, undecided: 24 } },
      { week: "31 Jul", shares: { us: 33, a: 34, b: 10, undecided: 23 } },
      { week: "7 Aug", shares: { us: 33, a: 34, b: 11, undecided: 22 } },
      { week: "14 Aug", shares: { us: 34, a: 34, b: 10, undecided: 22 } },
      { week: "21 Aug", shares: { us: 34, a: 33, b: 10, undecided: 23 } },
      { week: "28 Aug", shares: { us: 35, a: 34, b: 10, undecided: 21 } },
      { week: "4 Sep", shares: { us: 35, a: 33, b: 10, undecided: 22 } },
      { week: "11 Sep", shares: { us: 36, a: 34, b: 9, undecided: 21 } },
      { week: "18 Sep", shares: { us: 35, a: 34, b: 10, undecided: 21 } },
      { week: "25 Sep", shares: { us: 36, a: 34, b: 10, undecided: 20 } },
    ],
    own: {
      date: "20–23 Sep",
      method: "SMS panel, with door-to-door interviews, weighted by polling centre",
      n: 300,
      moe: 5.7,
      question: "If the MCA election were held today, who would you vote for?",
      shares: { us: 36, a: 34, b: 10, undecided: 20 },
    },
    outside: [],
    crosstabs: [
      { group: "Women 35+", us: 44, rival: 30, note: "Chamas and churches: your strongest group." },
      {
        group: "Men 18–30",
        us: 27,
        rival: 43,
        note: "Challenger A's football. Turnout is the question.",
      },
      { group: "Miraa farmers", us: 33, rival: 38, note: "The price cut is costing you." },
      { group: "Herders", us: 35, rival: 37, note: "Cattle theft and water." },
    ],
    ideas: [
      "What were you paid for a bundle of miraa this week?",
      "How far do you walk for water?",
      "Would you come to a bursary clinic on Saturday?",
    ],
  },
  opponents: [
    {
      key: "a",
      yesterday: "A church harambee at Limoro, then a youth football tournament at Maitha.",
      message: "A miraa fund, and jobs for young people.",
      voice: 47,
      spend: "≈ KES 40,000 this week (estimate)",
      threat: "high",
      watch: "He is at the Kibiru women's group meeting on Saturday. Send your centre captain.",
    },
    {
      key: "b",
      yesterday: "Door to door near Athwana Secondary with 5 volunteers.",
      message: "Clean politics; fix the roads.",
      voice: 11,
      spend: "Low",
      threat: "low",
      watch: "Splitting the vote at Mwanika; he takes more from Challenger A than from you.",
    },
  ],
  voters: {
    issues: [
      { label: "Miraa & farm prices", share: 44, change: 7, hot: "Limoro, Mwanika" },
      { label: "Water", share: 19, change: 3, hot: "Kibiru, Kiare" },
      { label: "Roads", share: 13, change: 1, hot: "Kiare, Muluta" },
      { label: "Cattle theft", share: 10, change: 2, hot: "Kadebene" },
      { label: "Bursaries", share: 8, change: 1, hot: "Every centre" },
      { label: "Health", share: 6, change: 0, hot: "Muluta" },
    ],
    groups: [
      { label: "Miraa farmers", size: "4,600 voters", move: -3, note: "The price cut." },
      {
        label: "Chama women",
        size: "2,100",
        move: 2,
        note: "Your organisers; they want bursaries and water.",
      },
      { label: "Young men", size: "2,300", move: -2, note: "Challenger A's football." },
      { label: "Herders", size: "1,200", move: 0, note: "Cattle theft and water." },
    ],
    quotes: [
      {
        text: "Bei ya miraa imeshuka tena.",
        translation: "The miraa price has dropped again.",
        who: "Farmer, 52",
        where: "Limoro · SMS reply",
      },
      {
        text: "We walk two hours for water since the borehole broke.",
        who: "Woman, 41",
        where: "Kibiru · canvass note",
      },
      {
        text: "Tunataka kazi, si mpira tu.",
        translation: "We want jobs, not just football.",
        who: "Man, 23",
        where: "Maitha · SMS poll",
      },
    ],
    persuadables: {
      count: 1_300,
      note: "Undecided or soft. Most farm miraa near Limoro and Mwanika.",
    },
  },
  lastTime: {
    title: "2017 MCA election, Athwana ward",
    official: true,
    source: "IEBC declared results, via BallotWinners (6,177 valid votes)",
    results: [
      { name: "Victor Karithi Mutumah (Jubilee)", votes: 2_625, share: 42.5 },
      { name: "Dionisio Jim Muchui (Maendeleo Chap Chap)", votes: 2_514, share: 40.7 },
      { name: "Joan Gacheri Theuri (PNU)", votes: 711, share: 11.5 },
      { name: "Three others", votes: 327, share: 5.3 },
    ],
    turnout: null,
    lessons: [
      "Won by 111 votes: in Athwana a few families at one centre decide it.",
      "Muchui lost in 2017, kept working the ward for five years (water, youth sports, self-help groups) and won in 2022 with 3,864 votes (team research).",
      "Elders and clan leaders carry weight here: meet the Njuri Ncheke early, at every centre.",
    ],
  },
  diary: [
    {
      time: "06:30",
      place: "Kadebene livestock market",
      kind: "Market",
      why: "Market day: walk the floor with the herders before the trading starts.",
    },
    {
      time: "10:00",
      place: "Kibiru borehole",
      kind: "Visit",
      why: "See the broken borehole with residents; take photos for the update.",
    },
    {
      time: "13:00",
      place: "Miraa buying centre, Limoro",
      kind: "Visit",
      why: "Farmers are there for the afternoon sale; talk about prices.",
    },
    {
      time: "16:00",
      place: "Women's group, Mwanika",
      kind: "Meeting",
      why: "Your strongest group at your biggest centre: ask each member to bring two neighbours.",
    },
    {
      time: "18:30",
      place: "Youth fellowship, Maitha",
      kind: "Church",
      why: "Young men are your weakest group; this is where they meet.",
    },
  ],
  watch: [
    {
      level: "high",
      kind: "Misinformation",
      title: "Voice note says the ward fund was spent elsewhere",
      detail:
        "Circulating in 9 village WhatsApp groups. Publish the ward fund projects with photos, and it ends.",
    },
    {
      level: "medium",
      kind: "Security",
      title: "Cattle theft near the Isiolo boundary",
      detail: "Back the chief's plan at the baraza; don't promise your own security operation.",
    },
    {
      level: "low",
      kind: "IEBC",
      title: "Voter registration drive: 23 days left (demo dates)",
      detail: "About 900 unregistered 18–25s in the ward. Each centre captain has a target.",
    },
    {
      level: "low",
      kind: "Money",
      title: "Spending: 19% of the limit",
      detail: "KES 820,000 of the gazetted KES 4.22M. Keep the reserve for agents.",
    },
  ],
  night: {
    seed: 38,
    swing: { us: 2 },
    forms: { station: "Form 36A", levels: ["36B · constituency"] },
    incidents: [
      {
        at: "18:30",
        severity: "SEV-3",
        title: "Late start at Kiare",
        area: "Kiare Primary School",
        detail: "Rain delayed the materials; voting extended 30 minutes.",
        status: "Logged",
      },
      {
        at: "20:10",
        severity: "SEV-2",
        title: "Agent turned away from a count",
        area: "Kibiru Primary School",
        detail: "Back in with the presiding officer's letter at 20:30.",
        status: "Resolved 20:30",
      },
    ],
    divergence: {
      at: "01:00",
      area: "Mwanika Primary School",
      detail:
        "The portal shows 96 more votes for Challenger A at one stream than our photographed 36A. Sent for review.",
    },
  },
  ops: {
    seed: 3807,
    sureShare: 0.6,
    foundLastWeek: 60,
    doors: { lastWeek: 520, plan: 700 },
    volunteers: { active: 22, newLastWeek: 3 },
    contacts: { optedIn: 1_400, newLastWeek: 70, optedOutLastWeek: 2 },
    agents: { recruited: 0.72, trained: 0.6, confirmed: 0.8 },
    money: {
      raised: 1_600_000,
      spent: 820_000,
      // The gazetted limit for an MCA in Athwana (Kenya Gazette Notice 12251, 7 August 2026).
      limit: 4_224_052,
      cash: 780_000,
      burnPerWeek: 55_000,
      pledged: 300_000,
      categories: [
        { label: "Field and transport", kes: 290_000 },
        { label: "Events and meetings", kes: 210_000 },
        { label: "Printing and media", kes: 150_000 },
        { label: "Staff", kes: 100_000 },
        { label: "Digital and SMS", kes: 50_000 },
        { label: "Other", kes: 20_000 },
      ],
    },
    coordinatorRole: "Centre captain",
    needs: [
      {
        label: "2 expenses waiting for approval",
        detail: "KES 14,000 · transport and tea for Saturday's women's group meeting",
        action: { kind: "go", label: "Review", to: "/finance" },
      },
      {
        label: "Broadcast drafted: the miraa meeting",
        detail: "Friday's meeting, to opted-in supporters near Limoro and Mwanika",
        action: { kind: "go", label: "Check and send", to: "/broadcast" },
      },
      {
        label: "6 replies waiting",
        detail: "Mostly about the Kibiru borehole",
        action: { kind: "go", label: "Reply", to: "/inbox" },
      },
    ],
  },
};
