// Checks for what the Report screen says: the days it covers and the days before, what it cannot
// see (lanes gone quiet, posts set aside), the four figures with their change, the mood about you
// as one score, a column for every day, the share of the conversation, where it was said, and the
// phrases. Invented posts, accounts and places only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/report-render.test.ts

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReportView } from "@/components/gw/listening/Report";
import type { MoodScore } from "@/lib/listening-report";
import type { ReportData } from "@/lib/listening-report.functions";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, markup = "") {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${markup ? `\n  in ${markup.slice(0, 1600)}` : ""}`);
  }
}

const mood = (o: Partial<MoodScore> = {}): MoodScore => ({
  posts: 50,
  read: 40,
  warm: 10,
  neutral: 10,
  angry: 20,
  unread: 10,
  net: -25,
  verdict: "Mostly angry",
  ...o,
});
const day = (d: string, o: Partial<ReportData["days"][number]> = {}) => ({
  day: d,
  warm: 0,
  neutral: 0,
  angry: 0,
  unread: 0,
  ids: [],
  ...o,
});

const data = (o: Partial<ReportData> = {}): ReportData => ({
  from: "2026-11-13",
  to: "2026-11-19",
  beforeFrom: "2026-11-06",
  beforeTo: "2026-11-12",
  today: "2026-11-19",
  figures: {
    posts: { value: 50, before: 40, change: 25 },
    views: { value: 0, before: 0, change: null, from: 0, fromBefore: 0 },
    shares: { value: 12, before: 0, change: null, from: 3, fromBefore: 0 },
    voices: { value: 9, before: 12, change: -25 },
  },
  youIds: ["p1", "p2"],
  viewIds: [],
  shareIds: ["p2"],
  mood: mood(),
  moodBefore: mood({ net: -5 }),
  days: [
    day("2026-11-13", { warm: 4, angry: 1, ids: ["p1"] }),
    day("2026-11-14"),
    day("2026-11-15", { angry: 9, neutral: 2, ids: ["p2"] }),
    day("2026-11-16"),
    day("2026-11-17"),
    day("2026-11-18"),
    day("2026-11-19", { unread: 3 }),
  ],
  sources: [
    { key: "news", label: "News", posts: 45, share: 90, views: null, ids: ["p1"] },
    { key: "x", label: "X", posts: 5, share: 10, views: 3200, ids: ["p2"] },
  ],
  voice: [
    {
      key: "t-r1",
      label: "Rival One",
      kind: "rival",
      posts: 60,
      share: 54.5,
      views: null,
      ids: [],
    },
    { key: "you", label: "You", kind: "you", posts: 50, share: 45.5, views: 3200, ids: ["p1"] },
  ],
  cloud: [
    { phrase: "water queues", posts: 9, ids: ["p1"] },
    { phrase: "#MtaaniMoves", posts: 4, ids: ["p2"] },
    { phrase: "market fees", posts: 2, ids: ["p1"] },
  ],
  phrases: [
    { phrase: "water queues", posts: 9, ids: ["p1"], before: 3, change: 200, score: 100 },
    { phrase: "market fees", posts: 2, ids: ["p1"], before: 0, change: null, score: 22 },
  ],
  hashtags: [{ phrase: "#MtaaniMoves", posts: 4, ids: ["p2"], before: 4, change: 0, score: 100 }],
  setAside: 31,
  truncated: false,
  quiet: [
    { source: "x", since: "2026-11-02T20:08:00Z" },
    { source: "tiktok", since: "2026-11-02T06:08:00Z" },
  ],
  ...o,
});

const render = (d: ReportData, span = 7) =>
  renderToStaticMarkup(
    createElement(ReportView, { data: d, span, setSpan: () => {}, open: () => {} }),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

{
  const html = render(data());
  const t = text(html);

  ok(
    "the days and the days before",
    /13\s*–\s*19 Nov 2026/.test(t) && /6\s*–\s*12 Nov 2026/.test(t),
    t,
  );
  ok("the chosen span is pressed", /aria-pressed="true"[^>]*>Last 7 days/.test(html), html);
  ok(
    "the lanes gone quiet, with their last find",
    t.includes("Nothing new has come from X (since Mon 2 Nov) and TikTok (since Mon 2 Nov)"),
    t,
  );
  ok("posts set aside are said", t.includes("31 posts found in these days were set aside"), t);
  ok("no truncation note when all was read", !t.includes("more posts than the Report reads"), t);

  ok(
    "posts about you, up a quarter",
    t.includes("Posts about you 50") && /up<\/span> 25%/.test(html),
    html,
  );
  ok(
    "no views counted shows a dash, and says why",
    t.includes("Views –") && t.includes("No post says how often it was seen."),
    t,
  );
  ok(
    "shares new when there were none before",
    /Shares 12 new/.test(t) && t.includes("3 of 50 posts say how often they were shared."),
    t,
  );
  ok("voices down a quarter", /Voices 9 [^A-Za-z]*down 25% from 12/.test(t), t);

  ok(
    "the net mood with its sign and the shift",
    t.includes("−25") && /down<\/span> 20 pts/.test(html) && t.includes("from −5"),
    html,
  );
  ok(
    "the verdict and the split",
    t.includes("Mostly angry") &&
      t.includes("25% warm, 25% neutral and 50% angry, of 40 posts read"),
    t,
  );
  ok("unread said", t.includes("10 posts not read for mood yet"), t);

  ok("a column for every day", (html.match(/class="rp-day/g) ?? []).length === 7, html);
  ok(
    "an empty day cannot be opened",
    /aria-label="Sat 14 Nov: nothing about you"[^>]*disabled/.test(html) ||
      /disabled=""[^>]*aria-label="Sat 14 Nov: nothing about you"/.test(html),
    html,
  );
  ok(
    "the warmest and the angriest day",
    t.includes("Warmest day: Fri 13 Nov , 4 warm posts") &&
      t.includes("Angriest day: Sun 15 Nov , 9 angry posts"),
    t,
  );

  ok(
    "share of the conversation, the rival first",
    t.indexOf("Rival One") < t.indexOf("You 45.5%"),
    t,
  );
  ok(
    "where it was said, views only where counted",
    t.includes("45 posts · no views counted") && t.includes("5 posts · seen 3.2k"),
    t,
  );
  ok("the phrase cloud", t.includes("water queues") && html.includes("rpt-s4"), html);
  ok(
    "a phrase up on the days before, and one that is new",
    /up<\/span> 200%/.test(html) && /market fees[^]*?new/.test(t),
    html,
  );
  ok("a hashtag level with the days before", t.includes("no change"), t);
  ok(
    "a figure with posts behind it opens them",
    /<button[^>]*rpt-tile[^>]*><span class="kpi-lbl">Shares/.test(html) &&
      /<button[^>]*rpt-tile[^>]*><span class="kpi-lbl">Voices/.test(html),
    html,
  );
  ok(
    "one with nothing behind it does not",
    /<div class="card kpi"><span class="kpi-lbl">Views/.test(html),
    html,
  );
}

{
  const seen = text(
    render(
      data({
        figures: {
          ...data().figures,
          views: {
            value: 256_400,
            before: 436_023,
            change: -41,
            from: 62,
            fromBefore: 80,
          },
        },
      }),
    ),
  );
  ok(
    "views and the views before are written alike",
    /Views 256k [^A-Za-z]*down 41% from 436k/.test(seen),
    seen,
  );
}

{
  const quiet = render(
    data({
      voice: [],
      cloud: [],
      phrases: [],
      hashtags: [],
      quiet: [],
      setAside: 0,
      truncated: true,
      mood: mood({ read: 0, warm: 0, neutral: 0, angry: 0, unread: 4, net: null, verdict: null }),
    }),
    30,
  );
  const t = text(quiet);
  ok(
    "no rival followed says how to compare",
    t.includes("Follow a rival as a keyword to compare with."),
    t,
  );
  ok(
    "no phrases yet",
    t.includes("Phrases show once a few posts about you use the same words."),
    t,
  );
  ok("truncation is said", t.includes("more posts than the Report reads at once"), t);
  ok("nothing read for mood yet", t.includes("has been read for mood yet"), t);
  ok("no quiet lane, no note about it", !t.includes("Nothing new has come from"), t);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
