// Demo: an MCA's campaign in Roysambu ward, Nairobi. The places, the five polling centres and
// their registered voters are IEBC's 2022 register (data/stations/nairobi.csv); the candidate
// is fictional, every other figure is invented and rivals are placeholders. The map is the part
// of the ward nearest each placed centre (public/geo/roysambu-centres.json): the Independent
// Presbyterian Church centre has no position yet, so it is in the tables but not on the map.

import type { AreaModel, Scenario } from "@/lib/demo/types";

// slug, name, registered, our share, Challenger A, Challenger B, turnout 2027,
// turnout 2022, our side's 2022 share, hours to results
type Row = [string, string, number, number, number, number, number, number, number, number];

const ROWS: Row[] = [
  ["ps-0145", "Muthaiga Primary School", 1_380, 41, 45, 14, 0.54, 0.57, 30, 0.5],
  ["ps-0146", "Thika Road Primary School", 3_879, 46, 40, 14, 0.52, 0.55, 33, 0.6],
  ["ps-0147", "Garden Estate Primary School", 8_914, 51, 35, 14, 0.5, 0.53, 35, 1.1],
  ["ps-0148", "Marurui Primary School", 8_524, 42, 45, 13, 0.6, 0.62, 28, 1.3],
  ["ps-0149", "Independent Presbyterian Church Compound", 8_461, 45, 42, 13, 0.57, 0.6, 31, 1.2],
];

/** Not yet placed in data/stations/nairobi-positions.csv, so not on the map. */
const OFF_MAP = new Set(["ps-0149"]);

const areas: AreaModel[] = ROWS.map(
  ([slug, name, registered, us, a, b, turnout, turnout2022, us2022, lag]) => ({
    slug,
    name,
    group: "Roysambu",
    registered,
    shares: { us, a, b },
    turnout,
    turnout2022,
    us2022,
    lag,
    ...(OFF_MAP.has(slug) ? { offMap: true as const } : {}),
  }),
);

export const roysambu: Scenario = {
  key: "roysambu",
  office: "mca",
  officeLabel: "Member of County Assembly",
  seat: "Roysambu Ward, Nairobi County",
  candidate: {
    name: "Wanjiru Kamau",
    first: "Wanjiru",
    initials: "WK",
    party: "National party",
    fictional: true,
  },
  contenders: [
    {
      key: "us",
      name: "Wanjiru Kamau",
      short: "Wanjiru",
      party: "National party",
      tone: "us",
      us: true,
    },
    { key: "a", name: "Challenger A", short: "Challenger A", party: "Regional party", tone: "a" },
    { key: "b", name: "Challenger B", short: "Challenger B", party: "Independent", tone: "b" },
  ],
  geo: {
    file: "/geo/roysambu-centres.json",
    unit: "polling centre",
    units: "polling centres",
    group: "Polling centre",
  },
  areas,
  winNumber: { target: 7_600, found: 4_380 },
  today: [
    {
      title: "Be in Marurui when the drain is cleared",
      detail:
        "Last week's rain flooded the lane behind Marurui Primary. The county crew is booked for 10:00. Marurui is your weakest centre (42 to 45), and a cleared drain is something people can see.",
      action: {
        kind: "task",
        label: "Block 09:45–11:30",
        task: "Marurui drain clearing with the county crew, 10:00",
      },
    },
    {
      title: "Answer the water rationing question tonight",
      detail:
        "Garden Estate has had water two days a week since September. Residents are asking in three WhatsApp groups when it ends. Say what the ward office will do, and when you will report back.",
      action: {
        kind: "draft",
        label: "Draft the update",
        title: "Water in Garden Estate",
        body: "Neighbours in Garden Estate: I have asked the water company for this month's supply schedule for our estates and will share it here on Friday. If your taps have been dry for more than three days, reply with your court or road so we can take a full list to the meeting.",
      },
    },
    {
      title: "Ask the ward about bursaries before the deadline",
      detail:
        "The ward bursary forms close in 9 days (demo date). Every family that applies through you is a family you have helped.",
      action: {
        kind: "poll",
        label: "Ask families",
        ask: "Does anyone in your home need a ward bursary form this term?",
      },
    },
  ],
  story: {
    tag: "Local",
    kicker: "Drainage · Marurui and Thika Road",
    headline: "Weekend rain floods three lanes off Thika Road",
    summary:
      "Water stood for two days behind Marurui Primary and along the service lane by Thika Road Primary. Residents say the drains have not been cleared since March.",
    numbers: [
      { value: "3", label: "lanes flooded this weekend" },
      { value: "8,524", label: "voters registered at Marurui Primary" },
      { value: "38%", label: "of replies name drainage first" },
    ],
    rivals:
      'Challenger A posted photos of the flooding with "Where is the ward office?". Challenger B hasn\'t spoken.',
    line: "Don't argue about whose fault it is. Be there when the drain is cleared, and publish the list of the next five lanes the crew will do.",
    actions: [
      {
        kind: "poll",
        label: "Ask which lane floods",
        ask: "Which lane near you flooded this weekend?",
      },
      {
        kind: "draft",
        label: "Draft the drains list",
        title: "The next five drains",
        body: "After this weekend's rain, the ward office has asked the county roads team to clear the drains on these five lanes, starting Tuesday. Reply with any lane we have missed and we will add it to the list.",
      },
    ],
    source: "Residents' WhatsApp replies and canvass notes (demo)",
    time: "06:10",
  },
  news: [
    {
      tag: "County",
      headline: "County announces the ward development fund allocations",
      soWhat: "Know Roysambu's figure before Challenger A quotes it at you.",
      source: "County notice (demo)",
      time: "Yesterday",
    },
    {
      tag: "Local",
      headline: "Traders near TRM protest a new parking fee",
      soWhat:
        "Thika Road Primary is close (46 to 40). Don't lose the traders over a county charge.",
      source: "Traders' association (demo)",
      time: "07:20",
      action: {
        kind: "poll",
        label: "Ask traders",
        ask: "Should the new parking fee near TRM be phased in?",
      },
    },
    {
      tag: "Opponent",
      headline: "Challenger A hosts a youth football tournament in Marurui",
      soWhat:
        "His base is young men; yours is women's groups and churches. Both turn out, if asked.",
      source: "Centre captain report (demo)",
      time: "Yesterday 18:40",
    },
    {
      tag: "Security",
      headline: "Residents' association asks for more street lights on the bypass",
      soWhat: "A safety issue every estate agrees on. Put your name to the request.",
      source: "Residents' association (demo)",
      time: "06:45",
    },
  ],
  polls: {
    average: [
      { week: "10 Jul", shares: { us: 30, a: 34, b: 10, undecided: 26 } },
      { week: "17 Jul", shares: { us: 31, a: 34, b: 10, undecided: 25 } },
      { week: "24 Jul", shares: { us: 31, a: 33, b: 10, undecided: 26 } },
      { week: "31 Jul", shares: { us: 32, a: 33, b: 10, undecided: 25 } },
      { week: "7 Aug", shares: { us: 32, a: 33, b: 11, undecided: 24 } },
      { week: "14 Aug", shares: { us: 33, a: 33, b: 10, undecided: 24 } },
      { week: "21 Aug", shares: { us: 33, a: 32, b: 10, undecided: 25 } },
      { week: "28 Aug", shares: { us: 34, a: 33, b: 10, undecided: 23 } },
      { week: "4 Sep", shares: { us: 34, a: 32, b: 10, undecided: 24 } },
      { week: "11 Sep", shares: { us: 35, a: 33, b: 9, undecided: 23 } },
      { week: "18 Sep", shares: { us: 34, a: 33, b: 10, undecided: 23 } },
      { week: "25 Sep", shares: { us: 35, a: 33, b: 10, undecided: 22 } },
    ],
    own: {
      date: "20–23 Sep",
      method: "SMS panel, with door-to-door interviews, weighted by polling centre",
      n: 420,
      moe: 4.8,
      question: "If the MCA election were held today, who would you vote for?",
      shares: { us: 35, a: 33, b: 10, undecided: 22 },
    },
    outside: [
      {
        pollster: "Pollster A",
        date: "12 Sep",
        n: 300,
        shares: { us: 33, a: 35, b: 11, undecided: 21 },
      },
    ],
    crosstabs: [
      { group: "Women 35+", us: 43, rival: 29, note: "Chamas and churches: your strongest group." },
      {
        group: "Men 18–30",
        us: 26,
        rival: 44,
        note: "Challenger A's football. Turnout is the question.",
      },
      {
        group: "Tenants",
        us: 31,
        rival: 36,
        note: "Water and rent; they move often, so register them now.",
      },
      { group: "Landlords", us: 44, rival: 30, note: "Roads and security." },
    ],
    ideas: [
      "Which lane near you flooded this weekend?",
      "How many days a week do you get water?",
      "Would you come to a bursary clinic on Saturday?",
    ],
  },
  opponents: [
    {
      key: "a",
      yesterday: "A youth football tournament in Marurui, then a WhatsApp post on the floods.",
      message: '"Where is the ward office?" and jobs for young people.',
      voice: 46,
      spend: "≈ KES 60,000 this week (estimate)",
      threat: "high",
      watch: "He is at the Garden Estate residents' meeting on Saturday. Send your centre captain.",
    },
    {
      key: "b",
      yesterday: "Door to door near Thika Road Primary with 6 volunteers.",
      message: "Clean politics; fix the street lights.",
      voice: 12,
      spend: "Low",
      threat: "low",
      watch: "Splitting the vote at Thika Road; he takes more from Challenger A than from you.",
    },
  ],
  voters: {
    issues: [
      { label: "Drainage & flooding", share: 38, change: 9, hot: "Marurui, Thika Road" },
      { label: "Water", share: 21, change: 3, hot: "Garden Estate" },
      { label: "Garbage", share: 13, change: 0, hot: "Every centre" },
      { label: "Jobs for young people", share: 12, change: 1, hot: "Marurui" },
      { label: "Security & lighting", share: 9, change: 2, hot: "Thika Road" },
      { label: "Bursaries", share: 7, change: 1, hot: "Every centre" },
    ],
    groups: [
      { label: "Tenants", size: "17,000 voters", move: -2, note: "Water and rent." },
      {
        label: "Chama women",
        size: "6,500",
        move: 2,
        note: "Your organisers; they want bursaries and safety.",
      },
      { label: "Young men", size: "7,200", move: -3, note: "Challenger A's football." },
      { label: "Traders near TRM", size: "1,900", move: 1, note: "The parking fee." },
    ],
    quotes: [
      {
        text: "Maji yanakuja Jumanne na Ijumaa tu.",
        translation: "The water only comes on Tuesday and Friday.",
        who: "Woman, 38",
        where: "Garden Estate · SMS reply",
      },
      {
        text: "Every rain, the lane becomes a river.",
        who: "Man, 47",
        where: "Marurui · canvass note",
      },
      {
        text: "Tunataka kazi, si mpira tu.",
        translation: "We want jobs, not just football.",
        who: "Man, 22",
        where: "Marurui · SMS poll",
      },
    ],
    persuadables: {
      count: 3_900,
      note: "Undecided or soft. Most are tenants at Marurui and Garden Estate.",
    },
  },
  lastTime: {
    title: "2022 MCA election, Roysambu ward (illustrative)",
    official: false,
    source: "Illustrative figures for the demo",
    results: [
      { name: "Winner, 2022", votes: 7_900, share: 48.5 },
      { name: "Runner-up", votes: 5_600, share: 34.4 },
      { name: "Others", votes: 2_800, share: 17.1 },
    ],
    turnout: 0.56,
    lessons: [
      "Turnout in Nairobi's estates is low, and tenants who moved since registering don't come back to vote.",
      "In a ward race a few hundred votes at one centre decide it: Marurui and the church centre are where it is close.",
      "Register and turn out your own: this race is mobilisation more than persuasion.",
    ],
  },
  diary: [
    {
      time: "07:00",
      place: "Thika Road service lane",
      kind: "Visit",
      why: "Walk the flooded lane with residents before work.",
    },
    {
      time: "10:00",
      place: "Marurui drain clearing",
      kind: "Visit",
      why: "Be there with the county crew; take photos for the update.",
    },
    {
      time: "13:00",
      place: "Garden Estate residents' association",
      kind: "Meeting",
      why: "Water rationing: agree the list to take to the water company.",
    },
    {
      time: "16:00",
      place: "Women's group, church centre",
      kind: "Meeting",
      why: "Your strongest group at your closest centre: ask each member to bring two neighbours.",
    },
    {
      time: "18:30",
      place: "Youth fellowship, Marurui",
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
        "Circulating in 12 estate WhatsApp groups. Publish the ward fund projects with photos, and it ends.",
    },
    {
      level: "medium",
      kind: "Weather",
      title: "More rain forecast this week",
      detail: "The same three lanes will flood again. Have the drains list ready to send.",
    },
    {
      level: "low",
      kind: "IEBC",
      title: "Voter registration drive: 23 days left (demo dates)",
      detail: "About 2,400 unregistered 18–25s in the ward. Each centre captain has a target.",
    },
    {
      level: "low",
      kind: "Money",
      title: "Spending: 9% of the limit",
      detail: "KES 410,000 so far. Keep the reserve for agents.",
    },
  ],
  night: {
    seed: 36,
    swing: { us: 2.2 },
    forms: { station: "Form 36A", levels: ["36B · constituency"] },
    incidents: [
      {
        at: "18:20",
        severity: "SEV-3",
        title: "Long queue at Garden Estate",
        area: "Garden Estate Primary School",
        detail: "Voters still in line at closing; the presiding officer let them vote.",
        status: "Logged",
      },
      {
        at: "19:40",
        severity: "SEV-2",
        title: "Agent turned away from a count",
        area: "Marurui Primary School",
        detail: "Back in with the presiding officer's letter at 19:58.",
        status: "Resolved 19:58",
      },
    ],
    divergence: {
      at: "01:00",
      area: "Independent Presbyterian Church Compound",
      detail:
        "The portal shows 96 more votes for Challenger A at one stream than our photographed 36A. Sent for review.",
    },
  },
  ops: {
    seed: 3605,
    sureShare: 0.58,
    foundLastWeek: 120,
    doors: { lastWeek: 1_400, plan: 1_800 },
    volunteers: { active: 38, newLastWeek: 5 },
    contacts: { optedIn: 4_100, newLastWeek: 160, optedOutLastWeek: 6 },
    agents: { recruited: 0.66, trained: 0.55, confirmed: 0.78 },
    money: {
      raised: 4_600_000,
      spent: 2_400_000,
      limit: 4_500_000,
      cash: 2_200_000,
      burnPerWeek: 140_000,
      pledged: 900_000,
      categories: [
        { label: "Field and transport", kes: 820_000 },
        { label: "Events and meetings", kes: 610_000 },
        { label: "Printing and media", kes: 450_000 },
        { label: "Staff", kes: 300_000 },
        { label: "Digital and SMS", kes: 160_000 },
        { label: "Other", kes: 60_000 },
      ],
    },
    coordinatorRole: "Centre captain",
    needs: [
      {
        label: "2 expenses waiting for approval",
        detail: "KES 38,000 · hall hire and tea for Saturday's women's group meeting",
        action: { kind: "go", label: "Review", to: "/finance" },
      },
      {
        label: "Broadcast drafted: the drains list",
        detail: "Tuesday's clearing, to opted-in supporters near Marurui and Thika Road",
        action: { kind: "go", label: "Check and send", to: "/broadcast" },
      },
      {
        label: "9 replies waiting",
        detail: "Mostly about water in Garden Estate",
        action: { kind: "go", label: "Reply", to: "/inbox" },
      },
    ],
  },
};
