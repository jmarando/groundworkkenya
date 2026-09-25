// Demo scenarios: one campaign per office, used by the morning briefing and
// the election-night war room. Every figure is invented unless a block says
// `official: true`. Rivals are placeholders, never named people.

export type Office = "president" | "governor" | "mp";
export type ScenarioKey = "kalonzo" | "sakaja" | "mathira";

export type NewsTag =
  "Local" | "County" | "National" | "Party" | "Opponent" | "Economy" | "Security";

/** Routes a briefing action may open. */
export type ActionRoute = "/voters" | "/canvassing" | "/listening" | "/broadcast" | "/field";

/** One tap from the briefing to doing something about it. */
export type Action =
  | { kind: "poll"; label: string; ask: string }
  | { kind: "draft"; label: string; title: string; body: string }
  | { kind: "go"; label: string; to: ActionRoute }
  | { kind: "task"; label: string; task: string };

/** Colour role: our candidate, the main rival, the third. CSS maps each to a validated series colour. */
export type Tone = "us" | "a" | "b";

export type Contender = {
  key: string;
  name: string;
  /** What charts and tables call them. */
  short: string;
  party: string;
  tone: Tone;
  us?: true;
};

/** One unit on the map: a county, a ward. */
export type AreaModel = {
  /** Matches the slug in the scenario's geo file. */
  slug: string;
  name: string;
  /** Region, constituency, or the seat itself. */
  group: string;
  registered: number;
  /** Modelled vote share today among decided voters, by contender key. The rest is others. */
  shares: Record<string, number>;
  /** Expected turnout on election day, 0-1. */
  turnout: number;
  /** Turnout in the same area in 2022, 0-1. */
  turnout2022: number;
  /** Our side's share of the vote here in 2022. */
  us2022: number;
  /** Hours after polls close before results from here usually arrive. */
  lag: number;
};

export type Story = {
  tag: NewsTag;
  kicker: string;
  headline: string;
  summary: string;
  /** Three numbers that say why it matters. */
  numbers: { value: string; label: string }[];
  /** How rivals are playing it. */
  rivals: string;
  /** What we should say. */
  line: string;
  actions: Action[];
  source: string;
  time: string;
};

export type NewsItem = {
  tag: NewsTag;
  headline: string;
  /** Why it matters to this campaign, in one line. */
  soWhat: string;
  source: string;
  time: string;
  action?: Action;
};

/** A week of the poll average: contender key or "undecided" to percent. */
export type PollPoint = { week: string; shares: Record<string, number> };

export type OwnPoll = {
  date: string;
  method: string;
  n: number;
  /** Margin of error, percentage points, 95%. */
  moe: number;
  question: string;
  shares: Record<string, number>;
};

export type OutsidePoll = {
  pollster: string;
  date: string;
  n: number;
  shares: Record<string, number>;
};

export type Crosstab = { group: string; us: number; rival: number; note: string };

export type OpponentBrief = {
  key: string;
  yesterday: string;
  message: string;
  /** Share of the online and media conversation this week, percent. */
  voice: number;
  spend: string;
  threat: "high" | "medium" | "low";
  watch: string;
};

export type Issue = { label: string; share: number; change: number; hot: string };
export type Group = { label: string; size: string; move: number; note: string };
export type Quote = { text: string; translation?: string; who: string; where: string };

export type DiaryItem = {
  time: string;
  place: string;
  kind: "Media" | "Market" | "Church" | "Funeral" | "Meeting" | "Rally" | "Visit";
  why: string;
};

export type WatchItem = {
  level: "high" | "medium" | "low";
  kind: "Misinformation" | "Security" | "IEBC" | "Money" | "Weather" | "Legal";
  title: string;
  detail: string;
};

export type LastTime = {
  title: string;
  /** True when the figures are the official IEBC results. */
  official: boolean;
  source: string;
  results: { name: string; votes: number; share?: number }[];
  /** 0-1, or null when we don't state it. */
  turnout: number | null;
  lessons: string[];
};

/** What happens on election night, beyond the votes themselves. */
export type NightScript = {
  seed: number;
  /** Points added to each contender's share by election day: how the undecided break. */
  swing: Record<string, number>;
  /** Result form names: polling station, then each tally level. */
  forms: { station: string; levels: string[] };
  incidents: {
    /** "HH:MM" on election night. */
    at: string;
    severity: "SEV-1" | "SEV-2" | "SEV-3";
    title: string;
    area: string;
    detail: string;
    status: string;
  }[];
  /** The one time the public portal and our forms disagree. */
  divergence: { at: string; area: string; detail: string };
};

export type Scenario = {
  key: ScenarioKey;
  office: Office;
  officeLabel: string;
  seat: string;
  candidate: {
    name: string;
    first: string;
    initials: string;
    party: string;
    fictional: boolean;
  };
  /** Our candidate first. */
  contenders: Contender[];
  geo: { file: string; unit: string; units: string; group: string };
  areas: AreaModel[];
  /** Governor and MP: the votes we need, and the supporters found so far. */
  winNumber?: { target: number; found: number };
  today: { title: string; detail: string; action: Action }[];
  story: Story;
  news: NewsItem[];
  polls: {
    average: PollPoint[];
    own: OwnPoll;
    outside: OutsidePoll[];
    crosstabs: Crosstab[];
    ideas: string[];
  };
  opponents: OpponentBrief[];
  voters: {
    issues: Issue[];
    groups: Group[];
    quotes: Quote[];
    persuadables: { count: number; note: string };
  };
  lastTime: LastTime;
  diary: DiaryItem[];
  watch: WatchItem[];
  night: NightScript;
};
