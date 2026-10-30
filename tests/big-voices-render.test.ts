// Checks for what the Big voices screen says: three columns side by side, the top three accounts
// and the top outlet of each, a size, a mood towards you and a move, "See more" for the rest, and
// nothing broken when there is nothing to show. Invented accounts only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/big-voices-render.test.ts

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BigVoicesView } from "@/components/gw/listening/BigVoices";
import type { BigVoice, Column } from "@/lib/big-voices";
import type { BigVoicesData } from "@/lib/big-voices.functions";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, markup = "") {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${markup ? `\n  in ${markup.slice(0, 600)}` : ""}`);
  }
}

const voice = (name: string, o: Partial<BigVoice> = {}): BigVoice => ({
  key: `x:${name.toLowerCase()}`,
  platform: "x",
  name,
  url: null,
  kind: "account",
  followers: null,
  posts: 3,
  seen: null,
  topIssues: [],
  read: 0,
  warm: 0,
  angry: 0,
  towardsWarm: null,
  towardsAngry: null,
  move: "win-over",
  angryPostId: null,
  postIds: [],
  last: "2026-10-29T10:00:00.000Z",
  ...o,
});
const column = (o: Partial<Column> = {}): Column => ({
  level: "seat",
  label: "Githunguri",
  accounts: [],
  outlets: [],
  smaller: 0,
  ...o,
});
const data = (columns: Column[], o: Partial<BigVoicesData> = {}): BigVoicesData => ({
  columns,
  days: 30,
  truncated: false,
  canBrief: false,
  approaches: {},
  ...o,
});
const render = (d: BigVoicesData, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(BigVoicesView, { data: d, open: () => undefined, ...props }));

// ---- the columns
{
  const m = render(
    data([
      column({
        accounts: [
          voice("@kamau", {
            platform: "tiktok",
            followers: 121_000,
            seen: 408_000,
            topIssues: ["roads"],
            read: 4,
            warm: 3,
            angry: 0,
            towardsWarm: 0.75,
            towardsAngry: 0,
            move: "recruit",
          }),
          voice("@njeri", {
            followers: 22_000,
            move: "respond",
            read: 2,
            warm: 0,
            angry: 2,
            towardsWarm: 0,
            towardsAngry: 1,
          }),
          voice("@third", { followers: 5_000 }),
          voice("@fourth", { followers: 4_000 }),
          voice("@fifth", { followers: 3_000 }),
        ],
        outlets: [
          voice("kiambucourier.example.test", {
            kind: "outlet",
            platform: "news",
            key: "site:kiambucourier.example.test",
            posts: 14,
            seen: 96_000,
            move: "press",
          }),
          voice("second.example.test", {
            kind: "outlet",
            platform: "news",
            key: "site:second.example.test",
            posts: 2,
            move: "press",
          }),
        ],
        smaller: 41,
      }),
      column({
        level: "county",
        label: "Kiambu",
        accounts: [voice("@county", { followers: 214_000, seen: 1_100_000 })],
      }),
      column({
        level: "country",
        label: "Kenya",
        accounts: [voice("@national", { followers: 1_400_000, seen: 6_800_000 })],
      }),
    ]),
  );
  ok(
    "each column is labelled",
    ["Githunguri", "Kiambu", "Kenya"].every((t) => m.includes(t)),
    m,
  );
  ok(
    "the top three accounts are shown",
    ["@kamau", "@njeri", "@third"].every((t) => m.includes(t)),
    m,
  );
  ok(
    "the fourth and fifth wait behind See more",
    !m.includes("@fourth") && !m.includes("@fifth"),
    m,
  );
  ok(
    "so does the second outlet, and See more counts them",
    !m.includes("second.example.test") && m.includes("See 3 more"),
    m,
  );
  ok("the top outlet is shown", m.includes("kiambucourier.example.test"), m);
  ok("followers and views are short", m.includes("121k followers") && m.includes("seen 408k"), m);
  ok("an outlet shows posts, not followers", m.includes("14 posts") && m.includes("seen 96k"), m);
  ok("the mood towards you", m.includes("75% warm") && m.includes("100% angry"), m);
  ok("the issue", m.includes("roads"), m);
  ok(
    "the moves are words",
    m.includes("Recruit") && m.includes("Respond") && m.includes("Press"),
    m,
  );
  ok(
    "posts from smaller accounts are counted, not named",
    m.includes("41 posts from smaller accounts"),
    m,
  );
  ok("big numbers read short", m.includes("1.4M followers") && m.includes("seen 6.8M"), m);
  ok("no broken values", !/NaN|undefined|null|Infinity/.test(m), m);
}

// ---- nothing to show
{
  const m = render(data([]));
  ok("no columns says so", /No big voices yet/.test(m), m);
  ok("and breaks nothing", !/NaN|undefined|null|Infinity/.test(m), m);
}
{
  const m = render(data([column({ smaller: 1 })]));
  ok(
    "a column with no one big enough says so",
    /big enough to name/.test(m) && m.includes("1 post from smaller accounts"),
    m,
  );
}
{
  const m = render(data([column({ accounts: [voice("@quiet")] })]));
  ok("a voice with no read posts says the mood is not read", m.includes("mood not read"), m);
  ok("and no size says nothing about size", !m.includes("followers") && !m.includes("seen "), m);
}
{
  const m = render(data([column({ accounts: [voice("@x")] })], { truncated: true }));
  ok("when more was found than read, it says so", /more posts than could be read/i.test(m), m);
}

// ---- the buttons
{
  const d = data(
    [
      column({
        accounts: [
          voice("@sore", {
            move: "respond",
            angryPostId: "m9",
            read: 2,
            angry: 2,
            towardsAngry: 1,
            towardsWarm: 0,
          }),
          voice("@fan", { move: "recruit" }),
        ],
        outlets: [
          voice("paper.example.test", {
            kind: "outlet",
            key: "site:paper.example.test",
            move: "press",
          }),
        ],
      }),
    ],
    {
      canBrief: true,
      approaches: { "x:@fan": { status: "approached", at: "2026-10-28T10:00:00.000Z" } },
    },
  );
  const plain = render(d);
  ok(
    "with no actions given there are no buttons",
    !/Brief/.test(plain) && !/Reply/.test(plain),
    plain,
  );
  const withActions = render(d, { brief: () => undefined, react: () => undefined });
  ok("an account can be briefed", (withActions.match(/>Brief</g) ?? []).length === 1, withActions);
  ok(
    "one already approached can be briefed again",
    (withActions.match(/>Brief again</g) ?? []).length === 1,
    withActions,
  );
  ok(
    "an outlet cannot",
    !/paper\.example\.test[\s\S]*>Brief</.test(withActions.split("@fan")[1] ?? ""),
    withActions,
  );
  ok(
    "an angry voice with a post to answer can be replied to",
    /Reply/.test(withActions),
    withActions,
  );
  ok("a voice already approached says so", /Approached 28 Oct/.test(withActions), withActions);
  const cannot = render(
    { ...d, canBrief: false },
    { brief: () => undefined, react: () => undefined },
  );
  ok("someone who cannot brief sees no Brief", !/Brief/.test(cannot), cannot);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
