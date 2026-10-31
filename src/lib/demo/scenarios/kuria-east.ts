// Demo: an MP's campaign in Kuria East, Migori County. The five wards and their map are real
// (public/geo/kuria-east-wards.json, geoBoundaries), as are each ward's registered voters (IEBC's
// 2022 register, 41,976 in all), the 2017 result and the spending limit (Kenya Gazette Notice
// 12251). The candidate is fictional, every other figure is invented and rivals are placeholders.

import type { AreaModel, Scenario } from "@/lib/demo/types";

// slug, name, registered, our share, Challenger A, Challenger B, turnout 2027,
// turnout 2022, our side's 2022 share, hours to results
type Row = [string, string, number, number, number, number, number, number, number, number];

const ROWS: Row[] = [
  ["nyabasi-west", "Nyabasi West", 10_865, 47, 41, 12, 0.71, 0.68, 34, 1.1],
  ["nyabasi-east", "Nyabasi East", 8_930, 45, 43, 12, 0.7, 0.67, 32, 1],
  ["ntimaru-west", "Ntimaru West", 8_628, 43, 45, 12, 0.71, 0.69, 30, 0.7],
  ["gokeharaka-getambwega", "Gokeharaka/Getambwega", 7_962, 45, 43, 12, 0.69, 0.66, 32, 1.3],
  ["ntimaru-east", "Ntimaru East", 5_591, 41, 47, 12, 0.68, 0.65, 27, 0.8],
];

const areas: AreaModel[] = ROWS.map(
  ([slug, name, registered, us, a, b, turnout, turnout2022, us2022, lag]) => ({
    slug,
    name,
    group: "Kuria East",
    registered,
    shares: { us, a, b },
    turnout,
    turnout2022,
    us2022,
    lag,
  }),
);

export const kuriaEast: Scenario = {
  key: "kuria-east",
  office: "mp",
  officeLabel: "Member of Parliament",
  seat: "Kuria East Constituency, Migori County",
  candidate: {
    name: "Ghati Mokami",
    first: "Ghati",
    initials: "GM",
    party: "National party",
    fictional: true,
  },
  contenders: [
    {
      key: "us",
      name: "Ghati Mokami",
      short: "Ghati",
      party: "National party",
      tone: "us",
      us: true,
    },
    { key: "a", name: "Challenger A", short: "Challenger A", party: "Regional party", tone: "a" },
    { key: "b", name: "Challenger B", short: "Challenger B", party: "Independent", tone: "b" },
  ],
  geo: { file: "/geo/kuria-east-wards.json", unit: "ward", units: "wards", group: "Ward" },
  areas,
  winNumber: { target: 15_400, found: 9_870 },
  today: [
    {
      title: "Get to the washed-out road before Challenger A does",
      detail:
        "The rains cut the road between Ntimaru and Nyabasi for the third day (demo). Traders and mothers on the clinic run are stuck. Be there with the ward coordinator, ask the roads office for a date, and say it on the radio the same evening.",
      action: {
        kind: "task",
        label: "Call the ward coordinator",
        task: "Call the Nyabasi East coordinator before 08:00 about the washed-out road",
      },
    },
    {
      title: "Be at the Ntimaru West funeral by 2pm",
      detail:
        "About 900 mourners. Ntimaru West is your second-weakest ward (43 to 45). Arrive early, speak briefly, stay for the meal.",
      action: {
        kind: "task",
        label: "Block 13:00–17:00",
        task: "Ntimaru West funeral, arrive 13:45",
      },
    },
    {
      title: "Announce the bursary list for Monday",
      detail:
        "820 students and their parents across all five wards (demo). Good news, and the best visibility moment of the month.",
      action: {
        kind: "draft",
        label: "Draft the announcement",
        title: "Bursary list on Monday",
        body: "The bursary list for 820 students from all five wards of Kuria East is ready. Parents and guardians can check it on Monday from 9am at the ward offices. Please bring the student's admission letter and your ID. Congratulations to every student: Kuria East is behind you.",
      },
    },
  ],
  story: {
    tag: "Local",
    kicker: "Roads · Nyabasi and Ntimaru",
    headline: "Heavy rains cut the road linking Ntimaru and Nyabasi",
    summary:
      "A culvert gave way after three days of rain. Matatus stop at the break and people walk the last stretch; the clinic run and the market day both suffer (demo).",
    numbers: [
      { value: "3 days", label: "the road has been cut" },
      { value: "2 wards", label: "cut off from Ntimaru market" },
      { value: "19%", label: "name roads as their first issue" },
    ],
    rivals:
      "Challenger A promised a new bridge at a funeral in Nyabasi East yesterday. Challenger B hasn't spoken.",
    line: "Don't promise a bridge an MP can't build this month. Offer what you can do this week: get the roads office and the ward representative on site on Friday, and publish the date the culvert will be fixed.",
    actions: [
      {
        kind: "poll",
        label: "Ask which roads are worst",
        ask: "Which road in your ward needs fixing first?",
      },
      {
        kind: "draft",
        label: "Draft Friday's invitation",
        title: "Invitation: the Ntimaru–Nyabasi road",
        body: "The road between Ntimaru and Nyabasi has been cut for three days. I am inviting the roads office and the ward representatives to meet me on site on Friday at 10am, with traders and clinic users. We will leave with a date for the repair and publish it the same day.",
      },
    ],
    source: "Ward coordinators and SMS replies (demo)",
    time: "06:10",
  },
  news: [
    {
      tag: "Economy",
      headline: "Maize prices firm up as the short-rains harvest nears",
      soWhat:
        "Good news for Nyabasi growers. Be at the market when the price board changes, not after.",
      source: "Market traders (demo)",
      time: "Yesterday",
    },
    {
      tag: "Local",
      headline: "Ntimaru boda riders ask for a proper stage near the market",
      soWhat:
        "Your strongest ward is Nyabasi West (47 to 41), but the riders are a town vote. A stage is a small ask the county can grant.",
      source: "Riders' group (demo)",
      time: "07:20",
      action: {
        kind: "poll",
        label: "Ask the riders",
        ask: "Should the county mark a proper boda stage near Ntimaru market?",
      },
    },
    {
      tag: "Opponent",
      headline: "Challenger A's youth football final draws about 600 in Nyabasi East",
      soWhat:
        "His machine is young men and sports clubs; yours is churches and women's groups. Both turn out, if asked.",
      source: "Ward coordinator report (demo)",
      time: "Yesterday 18:40",
    },
    {
      tag: "Security",
      headline: "Chiefs and elders meet on stock theft near the border",
      soWhat:
        "It touches every ward near the border. Stand behind the elders and the chiefs, not ahead of the police.",
      source: "Chief's baraza (demo)",
      time: "06:45",
    },
  ],
  polls: {
    average: [
      { week: "10 Jul", shares: { us: 32, a: 36, b: 8, undecided: 24 } },
      { week: "17 Jul", shares: { us: 32, a: 36, b: 8, undecided: 24 } },
      { week: "24 Jul", shares: { us: 33, a: 36, b: 8, undecided: 23 } },
      { week: "31 Jul", shares: { us: 33, a: 35, b: 9, undecided: 23 } },
      { week: "7 Aug", shares: { us: 34, a: 35, b: 9, undecided: 22 } },
      { week: "14 Aug", shares: { us: 34, a: 35, b: 9, undecided: 22 } },
      { week: "21 Aug", shares: { us: 35, a: 34, b: 9, undecided: 22 } },
      { week: "28 Aug", shares: { us: 35, a: 34, b: 9, undecided: 22 } },
      { week: "4 Sep", shares: { us: 36, a: 34, b: 9, undecided: 21 } },
      { week: "11 Sep", shares: { us: 36, a: 34, b: 9, undecided: 21 } },
      { week: "18 Sep", shares: { us: 36, a: 34, b: 9, undecided: 21 } },
      { week: "25 Sep", shares: { us: 37, a: 33, b: 9, undecided: 21 } },
    ],
    own: {
      date: "20–23 Sep",
      method: "SMS panel, with door-to-door interviews, weighted by ward",
      n: 500,
      moe: 4.4,
      question: "If the MP election were held today, who would you vote for?",
      shares: { us: 37, a: 33, b: 9, undecided: 21 },
    },
    outside: [
      {
        pollster: "Pollster A",
        date: "12 Sep",
        n: 380,
        shares: { us: 35, a: 36, b: 9, undecided: 20 },
      },
    ],
    crosstabs: [
      {
        group: "Women 35+",
        us: 46,
        rival: 29,
        note: "Churches and women's groups: your strongest group.",
      },
      {
        group: "Men 18–30",
        us: 27,
        rival: 43,
        note: "Challenger A's clubs and boda riders. Turnout is the question.",
      },
      { group: "Maize and tobacco growers", us: 36, rival: 39, note: "Prices decide it." },
      {
        group: "Ntimaru market traders",
        us: 48,
        rival: 32,
        note: "Keep them on the stage and the fees.",
      },
    ],
    ideas: [
      "Which road in your ward needs fixing first?",
      "Is the water point nearest your home working this week?",
      "Would you come to a jobs fair in Ntimaru?",
    ],
  },
  opponents: [
    {
      key: "a",
      yesterday: "The Nyabasi East football final (spoke for ten minutes), then a youth meeting.",
      message: "A new bridge, and jobs for boda riders.",
      voice: 46,
      spend: "≈ KES 140,000 this week (estimate)",
      threat: "high",
      watch: "He is at the Gokeharaka women's group on Saturday. Send your women's coordinator.",
    },
    {
      key: "b",
      yesterday: "Door to door in Ntimaru East with eight volunteers.",
      message: "Clean politics; water for every village.",
      voice: 12,
      spend: "Low",
      threat: "low",
      watch: "Splitting the vote in Ntimaru East; he takes more from Challenger A than from you.",
    },
  ],
  voters: {
    issues: [
      { label: "Roads and bridges", share: 19, change: 4, hot: "Nyabasi East, Ntimaru West" },
      { label: "Crop prices", share: 18, change: 2, hot: "Nyabasi West, Gokeharaka" },
      { label: "Jobs for young people", share: 16, change: 1, hot: "Ntimaru town" },
      { label: "Water", share: 14, change: 1, hot: "Gokeharaka/Getambwega" },
      { label: "Bursaries and girls in school", share: 12, change: 2, hot: "Every ward" },
      { label: "Security and stock theft", share: 9, change: 0, hot: "Border villages" },
    ],
    groups: [
      { label: "Maize and tobacco growers", size: "17,000 voters", move: -2, note: "Prices." },
      {
        label: "Church and women's groups",
        size: "9,000",
        move: 2,
        note: "Your organisers; they want bursaries and safe roads.",
      },
      { label: "Boda riders", size: "2,300", move: -1, note: "Challenger A's messengers." },
      { label: "Ntimaru market traders", size: "3,400", move: 1, note: "Fees and the stage." },
    ],
    quotes: [
      {
        text: "Barabara imekatika tena, hatuwezi kufika sokoni.",
        translation: "The road has been cut again, we can't reach the market.",
        who: "Woman, 41",
        where: "Nyabasi East · SMS reply",
      },
      {
        text: "Bei ya mahindi ikipanda, watoto wanaenda shule.",
        translation: "When the maize price rises, the children go to school.",
        who: "Farmer, 56",
        where: "Nyabasi West · canvass note",
      },
      {
        text: "Give the young men work and the stock theft goes down.",
        who: "Man, 48",
        where: "Gokeharaka · SMS poll",
      },
    ],
    persuadables: {
      count: 8_400,
      note: "Undecided or soft. Most live in farming households in Nyabasi East and Ntimaru East.",
    },
  },
  lastTime: {
    title: "2017 MP election, Kuria East",
    official: true,
    source: "IEBC declared results, via BallotWinners (26,771 valid votes)",
    results: [
      { name: "Kitayama Marwa Kemero Maisori (Jubilee)", votes: 15_499, share: 57.9 },
      { name: "Maroa Mwita Wilson Paul (ANC)", votes: 7_832, share: 29.3 },
      { name: "Robi Rahab (ODM)", votes: 1_643, share: 6.1 },
      { name: "Five others", votes: 1_797, share: 6.7 },
    ],
    turnout: null,
    lessons: [
      "In 2017 Jubilee's Kitayama took 57.9% of the valid votes, a 7,667-vote margin over ANC's Maroa Mwita. In 2022 he held the seat on a UDA ticket with 15,362 votes (Gazette 9950). The runner-up's tally is not on file.",
      "The seat has been tight before: in 2013 it was won by 45 votes, 7,928 to 7,883.",
      "In 2022 the presidential vote here went Ruto 16,795, Odinga 12,031, Wajackoyah 144 and Mwaure 62 (The Star, 13 August 2022): those four add up to 29,032, about 69% of the 41,976 on the register.",
    ],
  },
  diary: [
    {
      time: "07:00",
      place: "Ntimaru market",
      kind: "Market",
      why: "Market day: walk the traders' lines before the crowds and hear about the road.",
    },
    {
      time: "09:00",
      place: "Call the roads office",
      kind: "Meeting",
      why: "Set up Friday's site visit before Challenger A calls.",
    },
    {
      time: "11:30",
      place: "Nyabasi East washed-out road",
      kind: "Visit",
      why: "Be on site with the ward coordinator; take the photos and the date.",
    },
    {
      time: "14:00",
      place: "Funeral, Ntimaru West",
      kind: "Funeral",
      why: "About 900 mourners. Arrive early; speak briefly; stay for the meal.",
    },
    {
      time: "17:30",
      place: "Youth fellowship, Gokeharaka",
      kind: "Church",
      why: "Young men are your weakest group; this is where they're organised.",
    },
  ],
  watch: [
    {
      level: "high",
      kind: "Misinformation",
      title: "Voice note claims the bursary list is already closed",
      detail:
        "Circulating in 20 Nyabasi WhatsApp groups. Two lines from you, with the ward representatives beside you, end it.",
    },
    {
      level: "medium",
      kind: "Weather",
      title: "More rain forecast for Nyabasi and Ntimaru",
      detail:
        "Another break in the road would cut the clinic run. A visible repair date this week is the fix.",
    },
    {
      level: "low",
      kind: "IEBC",
      title: "Voter registration drive: 23 days left (demo dates)",
      detail:
        "Several thousand unregistered 18–25s in Kuria East. Each ward coordinator has a target.",
    },
    {
      level: "low",
      kind: "Money",
      title: "Spending: 36% of the limit",
      detail: "KES 6.9M of the gazetted KES 18.94M. Keep the reserve for agents.",
    },
  ],
  night: {
    seed: 41,
    swing: { us: 2.5 },
    forms: { station: "Form 35A", levels: ["35B · constituency"] },
    incidents: [
      {
        at: "18:10",
        severity: "SEV-3",
        title: "Late start at 2 stations",
        area: "Nyabasi East",
        detail: "Rain delayed the materials; voting extended 40 minutes.",
        status: "Logged",
      },
      {
        at: "19:35",
        severity: "SEV-2",
        title: "Agent turned away from a count",
        area: "Ntimaru West",
        detail: "Back in with the presiding officer's letter at 19:55.",
        status: "Resolved 19:55",
      },
      {
        at: "21:10",
        severity: "SEV-3",
        title: "Crowd at the tally centre",
        area: "Ntimaru West",
        detail: "Calm; police present.",
        status: "Monitoring",
      },
    ],
    divergence: {
      at: "21:50",
      area: "Ntimaru East",
      detail:
        "The portal shows 64 more votes for Challenger A at one station than our photographed 35A. Sent for review.",
    },
  },
  ops: {
    seed: 4217,
    sureShare: 0.6,
    foundLastWeek: 180,
    doors: { lastWeek: 2_100, plan: 2_800 },
    volunteers: { active: 96, newLastWeek: 8 },
    contacts: { optedIn: 9_800, newLastWeek: 260, optedOutLastWeek: 14 },
    agents: { recruited: 0.68, trained: 0.55, confirmed: 0.76 },
    money: {
      raised: 11_200_000,
      spent: 6_900_000,
      // The gazetted limit for an MP in Kuria East (Kenya Gazette Notice 12251, 7 August 2026).
      limit: 18_940_937,
      cash: 4_300_000,
      burnPerWeek: 360_000,
      pledged: 1_900_000,
      categories: [
        { label: "Field and transport", kes: 2_300_000 },
        { label: "Media and ads", kes: 1_500_000 },
        { label: "Events and rallies", kes: 1_400_000 },
        { label: "Staff", kes: 900_000 },
        { label: "Digital and SMS", kes: 500_000 },
        { label: "Other", kes: 300_000 },
      ],
    },
    coordinatorRole: "Ward coordinator",
    needs: [
      {
        label: "3 expenses waiting for approval",
        detail: "KES 264,000 · fuel and hall hire for Saturday's Nyabasi meeting",
        action: { kind: "go", label: "Review", to: "/finance" },
      },
      {
        label: "Broadcast drafted: Ntimaru market day",
        detail: "Thursday's walkabout, to opted-in supporters in Ntimaru East and West",
        action: { kind: "go", label: "Check and send", to: "/broadcast" },
      },
      {
        label: "9 replies waiting",
        detail: "Mostly about the road",
        action: { kind: "go", label: "Reply", to: "/inbox" },
      },
    ],
  },
};
