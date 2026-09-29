// Checks for volunteering on a campaign's website: reading the form, and
// recording the sign-up in the right campaign's People list with a request
// to confirm by SMS. Uses a stand-in database; nothing leaves this process.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/site-join.test.ts

import { JOIN_ERRORS, parseJoin } from "@/lib/site/join";
import { recordVolunteer } from "@/lib/site/join.server";

import { CHANNEL_CAMPAIGN, fakeSupabase } from "./fake-supabase";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const NOW = 1_800_000_000_000;
const wards = [{ id: "w1" }, { id: "w2" }];

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}

const typed = { name: "Wanjiku Maina", phone: "0712 345 678", t: String(NOW - 20_000) };

// ---------------------------------------------------------------- the form

eq("the trap field", parseJoin(form({ ...typed, website: "x" }), wards, NOW).kind, "bot");
eq("sent too fast", parseJoin(form({ ...typed, t: String(NOW - 500) }), wards, NOW).kind, "bot");
eq("no time at all", parseJoin(form({ ...typed, t: "soon" }), wards, NOW).kind, "bot");
{
  const r = parseJoin(form({ ...typed, t: String(NOW - 2 * 864e5) }), wards, NOW);
  eq(
    "open since yesterday: asked to send again",
    r.kind === "error" && r.message,
    JOIN_ERRORS.stale,
  );
}
{
  const r = parseJoin(form({ ...typed, phone: "12345" }), wards, NOW);
  eq("a number that is not a Kenyan mobile", r.kind === "error" && r.message, JOIN_ERRORS.phone);
  eq("what they typed is kept", r.kind === "error" && r.values.phone, "12345");
}
{
  const r = parseJoin(form({ ...typed, name: "  " }), wards, NOW);
  eq("no name", r.kind === "error" && r.message, JOIN_ERRORS.name);
}
{
  const r = parseJoin(
    form({ ...typed, ward: "w9", helps: ["doors", "hack", "doors", "agent"] }),
    wards,
    NOW,
  );
  eq("a good sign-up", r.kind, "ok");
  if (r.kind === "ok") {
    eq("the number as stored", r.values.phone, "+254712345678");
    eq("a ward that is not the campaign's is dropped", r.values.ward, "");
    eq("offers: known ones, once each", r.values.helps, ["doors", "agent"]);
  }
}
{
  const r = parseJoin(
    form({ ...typed, name: " Wanjiku \n  Maina\u202e ", ward: "w2" }),
    wards,
    NOW,
  );
  eq("the name tidied", r.kind === "ok" && r.values.name, "Wanjiku Maina");
  eq("the campaign's ward kept", r.kind === "ok" && r.values.ward, "w2");
}

// ---------------------------------------------------------------- recording

const MATHIRA = "camp-mathira";
const site = { campaignId: MATHIRA, label: "Waruru Gikandi" };
const values = {
  name: "Wanjiku Maina",
  phone: "+254712345678",
  ward: "w2",
  helps: ["doors", "calls"],
};

function db(seed: Record<string, Record<string, unknown>[]> = {}) {
  return fakeSupabase({
    campaigns: [
      { id: CHANNEL_CAMPAIGN, owns_channels: true, created_at: "2026-01-01T00:00:00Z" },
      { id: MATHIRA, owns_channels: false, created_at: "2026-02-01T00:00:00Z" },
    ],
    ...seed,
  });
}

async function main() {
  {
    const d = db();
    eq("recorded", await recordVolunteer(d as never, site, values), true);
    const [person] = d.tables["people"] ?? [];
    eq("one person", d.tables["people"]?.length, 1);
    eq("in the site's campaign, not the channel owner's", person?.["campaign_id"], MATHIRA);
    eq("with their name", person?.["full_name"], "Wanjiku Maina");
    eq("and ward", person?.["ward_id"], "w2");
    eq("tagged a volunteer", person?.["tags"], ["Volunteer"]);
    eq("from the website", person?.["source"], "website");
    eq("no consent from a web form", Boolean(person?.["consent_sms"]), false);
    const texts = d.tables["messages"] ?? [];
    eq("one confirmation text", texts.length, 1);
    eq(
      "naming the campaign that asked",
      String(texts[0]?.["body"]).startsWith("Waruru Gikandi: "),
      true,
    );
    eq("belonging to that campaign", texts[0]?.["campaign_id"], MATHIRA);
    eq("a conversation for the team", d.tables["conversations"]?.[0]?.["campaign_id"], MATHIRA);
    eq(
      "what they offered is on record",
      d.tables["person_events"]?.[0]?.["detail"],
      "Signed up on the website: Door to door, Phone calls",
    );
  }
  {
    const d = db({
      people: [
        {
          id: "p1",
          campaign_id: MATHIRA,
          phone: "+254712345678",
          full_name: "W. Maina",
          ward_id: "w1",
          tags: ["Church", "Volunteer"],
          opted_out: false,
        },
      ],
    });
    await recordVolunteer(d as never, site, values);
    const people = d.tables["people"] ?? [];
    eq("already known: still one record", people.length, 1);
    eq("the name the campaign has is kept", people[0]?.["full_name"], "W. Maina");
    eq("so is the ward", people[0]?.["ward_id"], "w1");
    eq("and the tag is not doubled", people[0]?.["tags"], ["Church", "Volunteer"]);
  }
  {
    const d = db({
      people: [{ id: "p1", campaign_id: CHANNEL_CAMPAIGN, phone: "+254712345678", full_name: "X" }],
    });
    await recordVolunteer(d as never, site, values);
    const people = d.tables["people"] ?? [];
    eq("known to another campaign: a record of Mathira's own", people.length, 2);
    eq("the other campaign's record is untouched", people[0], {
      id: "p1",
      campaign_id: CHANNEL_CAMPAIGN,
      phone: "+254712345678",
      full_name: "X",
    });
  }
  {
    const d = db({
      messages: [
        {
          id: "m1",
          campaign_id: CHANNEL_CAMPAIGN,
          phone: "+254712345678",
          direction: "out",
          outbox_kind: "consent_check",
          created_at: new Date().toISOString(),
        },
      ],
    });
    await recordVolunteer(d as never, site, values);
    eq(
      "one confirmation a day per number, whichever campaign asked",
      d.tables["messages"]?.length,
      1,
    );
  }
  {
    const d = db({
      people: [
        { id: "p1", campaign_id: MATHIRA, phone: "+254712345678", opted_out: true, tags: [] },
      ],
    });
    await recordVolunteer(d as never, site, values);
    eq("someone who said STOP is not texted", d.tables["messages"]?.length ?? 0, 0);
    eq("but the team still hears of it", d.tables["conversations"]?.length, 1);
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
