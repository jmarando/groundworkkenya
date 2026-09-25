// Demo: a presidential campaign. Figures are invented for the demo except the
// 2022 result, which is IEBC's. Rivals are placeholders, not named people.

import type { AreaModel, Scenario } from "@/lib/demo/types";

// slug, name, region, registered (approx.), our share, incumbent, challenger B,
// turnout 2027, turnout 2022, our side's 2022 share, hours to results
type Row = [string, string, string, number, number, number, number, number, number, number, number];

const ROWS: Row[] = [
  ["nairobi", "Nairobi", "Nairobi", 2_415_310, 50, 42, 6, 0.58, 0.56, 51, 0.3],
  ["kiambu", "Kiambu", "Mt Kenya", 1_294_450, 53, 40, 5, 0.72, 0.7, 21, 0.5],
  ["muranga", "Murang'a", "Mt Kenya", 587_126, 58, 36, 4, 0.74, 0.73, 13, 1],
  ["nyeri", "Nyeri", "Mt Kenya", 482_515, 60, 34, 4, 0.76, 0.75, 9, 0.9],
  ["kirinyaga", "Kirinyaga", "Mt Kenya", 364_000, 57, 37, 4, 0.74, 0.73, 11, 1],
  ["nyandarua", "Nyandarua", "Mt Kenya", 370_000, 52, 42, 4, 0.74, 0.73, 11, 1.1],
  ["laikipia", "Laikipia", "Mt Kenya", 262_000, 48, 46, 4, 0.7, 0.69, 26, 1.3],
  ["meru", "Meru", "Mt Kenya", 702_480, 44, 50, 4, 0.7, 0.7, 26, 1.2],
  ["tharaka-nithi", "Tharaka-Nithi", "Mt Kenya", 229_000, 44, 50, 4, 0.72, 0.72, 21, 1.4],
  ["embu", "Embu", "Mt Kenya", 331_000, 50, 45, 4, 0.73, 0.72, 17, 1.2],
  ["nakuru", "Nakuru", "Rift Valley", 1_054_856, 44, 51, 4, 0.68, 0.67, 33, 0.8],
  ["uasin-gishu", "Uasin Gishu", "Rift Valley", 506_138, 16, 80, 3, 0.74, 0.74, 20, 1],
  ["nandi", "Nandi", "Rift Valley", 350_000, 12, 85, 2, 0.75, 0.76, 9, 1.4],
  ["kericho", "Kericho", "Rift Valley", 369_000, 11, 86, 2, 0.74, 0.76, 5, 1.4],
  ["bomet", "Bomet", "Rift Valley", 346_000, 13, 84, 2, 0.75, 0.77, 5, 1.6],
  ["baringo", "Baringo", "Rift Valley", 281_000, 20, 76, 3, 0.72, 0.73, 11, 2],
  ["elgeyo-marakwet", "Elgeyo-Marakwet", "Rift Valley", 212_000, 10, 87, 2, 0.76, 0.78, 4, 2],
  ["narok", "Narok", "Rift Valley", 353_000, 42, 54, 3, 0.7, 0.71, 44, 2.2],
  ["kajiado", "Kajiado", "Rift Valley", 459_327, 50, 45, 4, 0.66, 0.65, 45, 1],
  ["trans-nzoia", "Trans Nzoia", "Rift Valley", 400_000, 47, 48, 4, 0.66, 0.65, 46, 1.6],
  ["west-pokot", "West Pokot", "Rift Valley", 200_000, 22, 74, 3, 0.68, 0.7, 29, 2.8],
  ["turkana", "Turkana", "Rift Valley", 239_000, 40, 55, 4, 0.6, 0.62, 44, 4],
  ["samburu", "Samburu", "Rift Valley", 101_000, 33, 63, 3, 0.68, 0.7, 45, 3.2],
  ["kakamega", "Kakamega", "Western", 745_778, 51, 44, 4, 0.66, 0.64, 60, 1.5],
  ["bungoma", "Bungoma", "Western", 559_850, 48, 47, 4, 0.66, 0.65, 45, 1.6],
  ["busia", "Busia", "Western", 393_454, 58, 37, 4, 0.66, 0.66, 83, 1.8],
  ["vihiga", "Vihiga", "Western", 369_000, 54, 41, 4, 0.64, 0.63, 64, 1.5],
  ["kisumu", "Kisumu", "Nyanza", 569_885, 55, 40, 4, 0.7, 0.72, 96, 1.2],
  ["siaya", "Siaya", "Nyanza", 493_280, 57, 38, 4, 0.7, 0.73, 97, 1.6],
  ["homa-bay", "Homa Bay", "Nyanza", 476_875, 56, 39, 4, 0.71, 0.74, 97, 1.8],
  ["migori", "Migori", "Nyanza", 434_975, 50, 45, 4, 0.68, 0.7, 92, 2],
  ["kisii", "Kisii", "Nyanza", 541_211, 46, 49, 4, 0.66, 0.66, 69, 1.6],
  ["nyamira", "Nyamira", "Nyanza", 291_000, 46, 49, 4, 0.66, 0.66, 70, 1.8],
  ["machakos", "Machakos", "Ukambani", 622_437, 78, 18, 3, 0.7, 0.68, 71, 0.9],
  ["makueni", "Makueni", "Ukambani", 489_039, 80, 16, 3, 0.7, 0.68, 81, 1.4],
  ["kitui", "Kitui", "Ukambani", 486_358, 77, 19, 3, 0.68, 0.66, 67, 1.8],
  ["mombasa", "Mombasa", "Coast", 641_913, 56, 39, 4, 0.5, 0.44, 64, 0.5],
  ["kilifi", "Kilifi", "Coast", 588_602, 58, 37, 4, 0.56, 0.53, 70, 1.6],
  ["kwale", "Kwale", "Coast", 328_000, 57, 38, 4, 0.58, 0.56, 72, 1.8],
  ["taita-taveta", "Taita Taveta", "Coast", 190_000, 62, 33, 4, 0.64, 0.63, 69, 2],
  ["tana-river", "Tana River", "Coast", 140_000, 52, 44, 3, 0.66, 0.66, 64, 3],
  ["lamu", "Lamu", "Coast", 81_000, 45, 51, 3, 0.64, 0.64, 51, 3],
  ["garissa", "Garissa", "North Eastern", 227_000, 48, 49, 2, 0.66, 0.67, 60, 3],
  ["wajir", "Wajir", "North Eastern", 222_000, 50, 47, 2, 0.7, 0.72, 55, 3.6],
  ["mandera", "Mandera", "North Eastern", 225_000, 44, 53, 2, 0.72, 0.74, 45, 4],
  ["marsabit", "Marsabit", "Upper Eastern", 142_000, 46, 51, 2, 0.7, 0.71, 57, 3.6],
  ["isiolo", "Isiolo", "Upper Eastern", 90_000, 50, 46, 3, 0.68, 0.69, 59, 2.6],
];

const areas: AreaModel[] = ROWS.map(
  ([slug, name, group, registered, us, a, b, turnout, turnout2022, us2022, lag]) => ({
    slug,
    name,
    group,
    registered,
    shares: { us, a, b },
    turnout,
    turnout2022,
    us2022,
    lag,
  }),
);

export const kalonzo: Scenario = {
  key: "kalonzo",
  office: "president",
  officeLabel: "President",
  seat: "Republic of Kenya",
  candidate: {
    name: "Kalonzo Musyoka",
    first: "Kalonzo",
    initials: "KM",
    party: "Wiper · opposition coalition",
    fictional: false,
  },
  contenders: [
    { key: "us", name: "Kalonzo Musyoka", party: "Opposition coalition", tone: "us", us: true },
    { key: "a", name: "The incumbent", party: "Ruling coalition", tone: "a" },
    { key: "b", name: "Challenger B", party: "Independent, youth-led", tone: "b" },
  ],
  geo: { file: "/geo/kenya-counties.json", unit: "county", units: "counties", group: "Region" },
  areas,
  today: [
    {
      title: "Answer the flour-price story before 9am",
      detail:
        "It will lead every breakfast show. A specific, costed answer now sets the frame for the week; a vague one hands it to the incumbent.",
      action: {
        kind: "draft",
        label: "Draft the answer",
        title: "On the price of flour",
        body: "A 2kg packet of flour now costs more than KES 200 in eleven counties. That is a family's lunch money, gone, before anyone talks about a harvest.\n\nFrom our first day we will zero-rate VAT on maize flour for twelve months, and we will publish every miller's margin, every month, so Kenyans can see who is making money from their hunger.\n\nPrices will not wait for an election. Neither should the answer.",
      },
    },
    {
      title: "Put Nakuru, not Machakos, on Saturday",
      detail:
        "Nakuru is the largest county where you trail (44 vs 51) and 22% of its voters are undecided. The incumbent is there on Saturday; Machakos is safe at 78%.",
      action: {
        kind: "task",
        label: "Move the rally",
        task: "Move Saturday's rally from Machakos to Nakuru",
      },
    },
    {
      title: "Settle the running-mate calendar with partners",
      detail:
        "Coalition partners meet on Saturday. In Mt Kenya East, where you lead by 3, voters rank the running-mate choice as their third question about you.",
      action: {
        kind: "draft",
        label: "Draft the note to partners",
        title: "Note to coalition partners",
        body: "Ahead of Saturday: we propose agreeing the process and the date for the running-mate decision, not the name. A public date takes the question off the front pages and lets each partner brief their region on the same day.",
      },
    },
  ],
  story: {
    tag: "Economy",
    kicker: "Cost of living · national",
    headline: "Flour up 14% in six weeks: a 2kg packet now costs more than KES 200 in 11 counties",
    summary:
      "Millers blame the short rains and a weaker shilling. Prices rose fastest in Ukambani, Nairobi and the Coast, where households spend about a third of their income on food.",
    numbers: [
      { value: "41%", label: "of voters name prices as their first issue, up 3 this week" },
      { value: "+220%", label: "online conversation about flour since last night" },
      { value: "11", label: "counties where 2kg costs more than KES 200" },
    ],
    rivals:
      "The incumbent's side says prices will ease after the harvest and points to the fertiliser subsidy. Challenger B is posting price comparisons from Gikomba market with #BeiYaUnga.",
    line: "Don't argue about the harvest. Name what it costs a family this week, then one costed fix: zero VAT on maize flour for twelve months, and millers' margins published every month.",
    actions: [
      { kind: "go", label: "See where it's loudest", to: "/listening" },
      {
        kind: "poll",
        label: "Ask 2,000 voters what they pay",
        ask: "What did you pay for 2kg of maize flour this week?",
      },
    ],
    source: "Market price survey and listening (demo)",
    time: "05:40",
  },
  news: [
    {
      tag: "National",
      headline: "Parliament's budget committee to table changes to the Finance Bill next week",
      soWhat:
        "Taxes rose 4 points as a top issue this month. Expect the incumbent to pre-empt with relief measures; have your costed alternative ready.",
      source: "Parliament order paper (demo)",
      time: "Yesterday 18:10",
    },
    {
      tag: "Party",
      headline: "Coalition partners meet on Saturday on the running mate and zoning",
      soWhat:
        "A public split would cost you in Mt Kenya East, where your lead is inside the margin. Agree a process before you agree a name.",
      source: "Coalition secretariat",
      time: "Yesterday 21:30",
    },
    {
      tag: "Opponent",
      headline: "The incumbent tours three Western counties with road and market launches",
      soWhat:
        "Western is 2.1M voters and your lead there fell 2 points in a month. Your Western team needs a visit on the calendar within ten days.",
      source: "Media monitoring",
      time: "Yesterday",
    },
    {
      tag: "Economy",
      headline: "Coffee cherry payments delayed in four Mt Kenya counties",
      soWhat:
        "A cost-of-living story with a face: about 150,000 farming households, many of them undecided.",
      source: "Farmer groups (demo)",
      time: "06:05",
      action: {
        kind: "poll",
        label: "Ask farmers",
        ask: "When were you last paid for your coffee or tea?",
      },
    },
    {
      tag: "Security",
      headline:
        "County security committees ask rallies for seven days' notice ahead of the holiday",
      soWhat: "Saturday's Nakuru stop has to be filed by 10:00 today.",
      source: "County commissioners",
      time: "07:00",
    },
  ],
  polls: {
    average: [
      { week: "10 Jul", shares: { us: 38, a: 45, b: 5, undecided: 12 } },
      { week: "17 Jul", shares: { us: 38, a: 45, b: 5, undecided: 12 } },
      { week: "24 Jul", shares: { us: 39, a: 45, b: 5, undecided: 11 } },
      { week: "31 Jul", shares: { us: 39, a: 44, b: 6, undecided: 11 } },
      { week: "7 Aug", shares: { us: 40, a: 44, b: 6, undecided: 10 } },
      { week: "14 Aug", shares: { us: 40, a: 44, b: 5, undecided: 11 } },
      { week: "21 Aug", shares: { us: 41, a: 44, b: 5, undecided: 10 } },
      { week: "28 Aug", shares: { us: 42, a: 44, b: 5, undecided: 9 } },
      { week: "4 Sep", shares: { us: 42, a: 43, b: 5, undecided: 10 } },
      { week: "11 Sep", shares: { us: 43, a: 43, b: 4, undecided: 10 } },
      { week: "18 Sep", shares: { us: 43, a: 43, b: 4, undecided: 10 } },
      { week: "25 Sep", shares: { us: 44, a: 43, b: 4, undecided: 9 } },
    ],
    own: {
      date: "22–24 Sep",
      method: "SMS and USSD panel, weighted by county, age and sex",
      n: 4210,
      moe: 1.5,
      question: "If the presidential election were held today, who would you vote for?",
      shares: { us: 44, a: 43, b: 4, undecided: 9 },
    },
    outside: [
      {
        pollster: "Pollster A",
        date: "18 Sep",
        n: 2000,
        shares: { us: 41, a: 45, b: 5, undecided: 9 },
      },
      {
        pollster: "Pollster B",
        date: "9 Sep",
        n: 1800,
        shares: { us: 43, a: 44, b: 4, undecided: 9 },
      },
    ],
    crosstabs: [
      {
        group: "Women 25–44",
        us: 49,
        rival: 38,
        note: "Your widest lead; prices are their first issue.",
      },
      {
        group: "Men 18–24",
        us: 33,
        rival: 41,
        note: "Challenger B takes 14% here. They decide late and vote less.",
      },
      {
        group: "Mt Kenya East",
        us: 47,
        rival: 44,
        note: "Up 6 in a month, still inside the margin.",
      },
      { group: "Rift Valley", us: 24, rival: 70, note: "Above the 25% line in 6 of 13 counties." },
    ],
    ideas: [
      "What did you pay for 2kg of maize flour this week?",
      "Who do you trust most to bring prices down?",
      "If the election were this Saturday, would you vote?",
    ],
  },
  opponents: [
    {
      key: "a",
      yesterday:
        "Busia, Kakamega and Bungoma: two road launches, a market opening and four roadside stops.",
      message: "Roads, markets and jobs from the housing programme.",
      voice: 46,
      spend: "≈ KES 18M this week on radio and digital (estimate)",
      threat: "high",
      watch: "Kisii on Saturday. Get the tea-bonus figures to the Nyanza team before he lands.",
    },
    {
      key: "b",
      yesterday: "Two campus debates in Nairobi and a TikTok live watched by 380,000.",
      message: "Jobs, digital taxes, a new generation.",
      voice: 17,
      spend: "Low; almost all organic",
      threat: "medium",
      watch:
        "He is winning 18–24s online. A youth jobs announcement from you this week would blunt it.",
    },
  ],
  voters: {
    issues: [
      { label: "Cost of living", share: 41, change: 3, hot: "Ukambani, Coast, Nairobi" },
      { label: "Jobs", share: 22, change: 1, hot: "Nairobi, Kisumu, Nakuru" },
      { label: "Taxes", share: 12, change: 4, hot: "Nairobi, Mombasa" },
      { label: "Health cover", share: 9, change: 2, hot: "Western, Nyanza" },
      { label: "Corruption", share: 7, change: -1, hot: "Nairobi" },
      { label: "Education", share: 6, change: -2, hot: "Mt Kenya" },
    ],
    groups: [
      {
        label: "Women 25–44",
        size: "4.6M voters",
        move: 4,
        note: "Moving to you on prices: the widest gap in the race.",
      },
      {
        label: "First-time voters",
        size: "1.9M",
        move: -2,
        note: "Challenger B's online surge, and a turnout risk.",
      },
      {
        label: "Boda boda riders",
        size: "1.1M",
        move: 1,
        note: "Fuel prices; they carry the conversation to the villages.",
      },
      { label: "Farmers, Mt Kenya East", size: "0.9M", move: 3, note: "Coffee and milk payments." },
    ],
    quotes: [
      {
        text: "Mimi sina shida na siasa, shida ni bei ya unga.",
        translation: "My problem isn't politics, it's the price of flour.",
        who: "Woman, 34, trader",
        where: "Machakos · SMS reply",
      },
      {
        text: "Tunataka kazi, si ahadi.",
        translation: "We want jobs, not promises.",
        who: "Man, 22",
        where: "Kisumu · USSD poll",
      },
      {
        text: "The roads came, but the coffee money did not.",
        who: "Farmer, 58",
        where: "Meru · canvass note",
      },
    ],
    persuadables: {
      count: 2_140_000,
      note: "Undecided or soft either way, in counties you can win. Half are in five counties: Nairobi, Nakuru, Kiambu, Meru and Kakamega.",
    },
  },
  lastTime: {
    title: "2022 presidential election",
    official: true,
    source: "IEBC, declared 15 August 2022",
    results: [
      { name: "William Ruto", votes: 7_176_141, share: 50.49 },
      { name: "Raila Odinga", votes: 6_942_930, share: 48.85 },
      { name: "George Wajackoyah", votes: 61_969, share: 0.44 },
      { name: "David Mwaure", votes: 31_987, share: 0.23 },
    ],
    turnout: 0.654,
    lessons: [
      "Decided by 233,211 votes, 1.6 points. A single region's turnout can swing it.",
      "The 25% rule was never the problem: both leading candidates cleared it widely. The 50% line is.",
      "Your side's vote was deep in fewer counties. Winning means being competitive in Nakuru, Meru and Kisii, not bigger in Ukambani.",
    ],
  },
  diary: [
    {
      time: "06:40",
      place: "National Kiswahili radio, breakfast show",
      kind: "Media",
      why: "Answer the flour story in the first hour, to the widest audience.",
    },
    {
      time: "10:00",
      place: "Coalition secretariat, Karen",
      kind: "Meeting",
      why: "Agree Saturday's agenda before it leaks.",
    },
    {
      time: "13:30",
      place: "Wakulima market, Nakuru",
      kind: "Market",
      why: "The biggest county where you trail; traders feel prices first.",
    },
    {
      time: "16:00",
      place: "Egerton University, Njoro",
      kind: "Visit",
      why: "18–24s are Challenger B's strongest group; show up where they are.",
    },
    {
      time: "20:00",
      place: "Prime-time TV interview",
      kind: "Media",
      why: "Expect the running mate, the Finance Bill and your 2022 record.",
    },
  ],
  watch: [
    {
      level: "high",
      kind: "Misinformation",
      title: "Edited clip claims you endorsed the housing levy",
      detail:
        "48,000 views since midnight, spreading in Kitui and Machakos WhatsApp groups. It is doctored; the fact-check is drafted.",
    },
    {
      level: "medium",
      kind: "Security",
      title: "Rally notice: seven days",
      detail: "Saturday's Nakuru stop has to be filed with the county committee by 10:00 today.",
    },
    {
      level: "medium",
      kind: "IEBC",
      title: "Voter registration drive: 23 days left (demo dates)",
      detail:
        "1.4M unregistered 18–25s live in counties where you lead. The youth wing's target is 300,000.",
    },
    {
      level: "low",
      kind: "Money",
      title: "Spending: 27% of the legal limit",
      detail: "On pace for the calendar. Digital is 38% of spend this month.",
    },
    {
      level: "low",
      kind: "Weather",
      title: "Short rains start in the west next week",
      detail: "Plan indoor venues in Kakamega and Kisii from 6 October.",
    },
  ],
  night: {
    seed: 2027,
    swing: { us: 3 },
    forms: { station: "Form 34A", levels: ["34B · constituency", "34C · national"] },
    incidents: [
      {
        at: "18:20",
        severity: "SEV-3",
        title: "Late opening, 42 stations",
        area: "Turkana",
        detail: "Materials arrived after 07:00; voting extended by IEBC.",
        status: "Logged",
      },
      {
        at: "19:05",
        severity: "SEV-2",
        title: "Agents kept out of a tally centre",
        area: "Nakuru",
        detail: "Three agents; the lawyer on call has the returning officer's number.",
        status: "Resolved 19:40",
      },
      {
        at: "20:30",
        severity: "SEV-2",
        title: "KIEMS kit failures",
        area: "Kakamega",
        detail: "Printed register used at 11 stations; forms still signed.",
        status: "Monitoring",
      },
      {
        at: "22:10",
        severity: "SEV-1",
        title: "Forms 34A without agents' signatures",
        area: "Mandera",
        detail: "4 forms; photos held; objection filed at the 34B tally.",
        status: "→ Legal",
      },
      {
        at: "00:45",
        severity: "SEV-3",
        title: "Power cut at a tally centre",
        area: "Kitui",
        detail: "Generator in 20 minutes; nothing lost.",
        status: "Resolved 01:10",
      },
    ],
    divergence: {
      at: "23:40",
      area: "Kisii",
      detail:
        "The portal shows 1,204 fewer votes for us at 3 stations than our photographed 34As. Sent for review.",
    },
  },
};
