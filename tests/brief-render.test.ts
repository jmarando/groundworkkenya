// Checks for what the brief panel says: why a voice is worth a brief, Daraja Pulse's three standing
// lines (always there), the invitation to edit, Copy for WhatsApp or DM, Send greyed out with its
// note until Pulse can take it, where an approach stands, and that an outlet is never briefed as a
// creator. Invented accounts only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/brief-render.test.ts

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BigVoicesView } from "@/components/gw/listening/BigVoices";
import { BriefVoice } from "@/components/gw/listening/BriefVoice";
import type { BigVoice, Column } from "@/lib/big-voices";
import type { BigVoicesData } from "@/lib/big-voices.functions";
import { STANDING_LINES } from "@/lib/outreach";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, markup = "") {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${markup ? `\n  in ${markup.slice(0, 1400)}` : ""}`);
  }
}

const voice = (o: Partial<BigVoice> = {}): BigVoice => ({
  key: "tiktok:@mtaani_reels",
  platform: "tiktok",
  name: "@mtaani_reels",
  url: "https://www.tiktok.com/@mtaani_reels",
  kind: "account",
  followers: 38_000,
  posts: 12,
  seen: 41_000,
  topIssues: ["water", "roads"],
  read: 6,
  warm: 3,
  angry: 1,
  towardsWarm: 0.5,
  towardsAngry: 1 / 6,
  move: "recruit",
  angryPostId: null,
  postIds: [],
  last: "2026-10-29T10:00:00.000Z",
  ...o,
});
const campaign = { candidate: "Test Candidate", seat: "Testville" };
const noop = () => undefined;
const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(BriefVoice, {
      voice: voice(),
      level: "seat",
      days: 30,
      campaign,
      close: noop,
      copy: noop,
      ...props,
    } as never),
  );
const clean = (m: string) => !/NaN|undefined|Infinity|\[object|>null</.test(m);
const pulseNote = (m: string) => /Daraja Pulse isn(&#x27;|')t connected to Groundwork yet/.test(m);

// ---- a voice not yet approached
{
  const m = render();
  ok("who it is", m.includes("@mtaani_reels") && m.includes("TikTok"), m);
  ok(
    "why them: the posts, where found, the views and the mood",
    m.includes("12 posts in the last 30 days") && m.includes("41,000") && m.includes("50% warm"),
    m,
  );
  ok(
    "the three standing lines, all there",
    STANDING_LINES.every((l) => m.includes(l.replace(/"/g, "&quot;").replace(/'/g, "&#x27;"))) &&
      STANDING_LINES.length === 3,
    m,
  );
  ok("and said to be on every brief", /every brief/.test(m), m);
  ok("no way to remove a line", !/<button[^>]*>[^<]*(remove|delete)/i.test(m), m);
  ok(
    "an invitation to edit, with the candidate, the seat and the issue",
    /<textarea[^>]*>[^<]*Test Candidate in Testville[^<]*water[^<]*<\/textarea>/.test(m),
    m,
  );
  ok("the limit is told", m.includes("of 2,000"), m);
  ok("Copy for WhatsApp or DM", m.includes("Copy for WhatsApp or DM"), m);
  ok(
    "Send is there, greyed out, with its note",
    /disabled=""[^>]*>Send to Daraja Pulse</.test(m) && pulseNote(m),
    m,
  );
  ok("the way back", m.includes("← Big voices"), m);
  ok("no status to set before an approach", !/Where it stands/.test(m), m);
  ok("nothing broken", clean(m), m);
}

// ---- Send, once Pulse can take it
{
  const m = render({ pulseConnected: true, send: noop });
  ok(
    "Send is enabled when Pulse is connected",
    /<button(?![^>]*disabled)[^>]*>Send to Daraja Pulse</.test(m),
    m,
  );
  ok("and the note is gone", !pulseNote(m), m);
  const noDoor = render({ pulseConnected: true });
  ok(
    "with nothing to send with, it stays off",
    /disabled=""[^>]*>Send to Daraja Pulse</.test(noDoor),
    noDoor,
  );
}

// ---- a voice already approached
{
  const m = render({
    approach: {
      status: "invited",
      at: "2026-11-03T08:00:00.000Z",
      invitation: "My own words, edited before.",
    },
    setStatus: noop,
  });
  ok(
    "its saved invitation, not a fresh one",
    m.includes("My own words, edited before.") && !m.includes("Test Candidate in Testville"),
    m,
  );
  ok("where it stands, and since when", m.includes("Invited") && m.includes("03 Nov"), m);
  ok(
    "a status to set by hand, with the four",
    /Where it stands/.test(m) &&
      ["Approached", "Invited", "On roster", "Declined"].every((s) => m.includes(`>${s}<`)),
    m,
  );
  ok("the current one is chosen", /<option value="invited" selected=""/.test(m), m);
  const viewer = render({ approach: { status: "invited", at: "2026-11-03T08:00:00.000Z" } });
  ok(
    "without the means to set it, only the fact is told",
    !/<select/.test(viewer) && viewer.includes("Invited"),
    viewer,
  );
}

// ---- a voice with nothing to say about, and other places
{
  const m = render({
    voice: voice({
      topIssues: [],
      followers: null,
      seen: null,
      read: 0,
      towardsWarm: null,
      towardsAngry: null,
    }),
  });
  ok(
    "no issue, no sentence about it",
    !m.includes("what you say about") && !/Mostly about/.test(m),
    m,
  );
  ok("no numbers, none shown", !m.includes("followers") && m.includes("Mood not read yet"), m);
  ok("nothing broken", clean(m), m);
  ok("a county voice says so", render({ level: "county" }).includes("county"), "");
  ok(
    "a Facebook page is a page",
    render({
      voice: voice({ platform: "facebook", key: "facebook:somepage", name: "Some Page" }),
    }).includes("your page"),
    "",
  );
}

// ---- an outlet is never briefed as a creator
{
  const m = render({
    voice: voice({
      kind: "outlet",
      key: "site:kiambucourier.example.test",
      platform: "news",
      name: "kiambucourier.example.test",
    }),
  });
  ok(
    "a note to its newsroom, and no invitation or copy button",
    m.includes("newsroom") && !/<textarea/.test(m) && !m.includes("Copy for WhatsApp or DM"),
    m,
  );

  const outletOnly: Column[] = [
    {
      level: "seat",
      label: "Testville",
      accounts: [],
      outlets: [
        voice({
          kind: "outlet",
          key: "site:kiambucourier.example.test",
          platform: "news",
          name: "kiambucourier.example.test",
          move: "press",
        }),
      ],
      smaller: 0,
    },
  ];
  const data: BigVoicesData = {
    columns: outletOnly,
    days: 30,
    truncated: false,
    canBrief: true,
    approaches: {},
    campaign,
    pulseConnected: false,
  };
  const list = renderToStaticMarkup(
    createElement(BigVoicesView, { data, open: noop, brief: noop }),
  );
  ok(
    "Big voices offers no Brief on an outlet",
    list.includes("kiambucourier.example.test") && !/>Brief</.test(list),
    list,
  );
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
