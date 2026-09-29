// Checks that replies on the shared SMS line reach the campaign that texted
// the number, and that STOP stops every campaign texting from that line.
// Uses a stand-in database; nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/inbound-routing.test.ts

import { handleInboundSms, replyCampaignId } from "@/lib/inbound.server";

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

const MATHIRA = "camp-mathira";
const PHONE = "+254712345678";
const hoursAgo = (h: number) => new Date(Date.now() - h * 36e5).toISOString();

type Row = Record<string, unknown>;

function db(seed: Record<string, Row[]> = {}) {
  return fakeSupabase(
    {
      campaigns: [
        {
          id: CHANNEL_CAMPAIGN,
          owns_channels: true,
          name: "Sakaja 2027",
          candidate: "Johnson Sakaja",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: MATHIRA,
          owns_channels: false,
          name: "Waruru Gikandi",
          candidate: "Waruru Gikandi",
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
      ...seed,
    },
    { process_outbox: () => ({}) },
  );
}

/** Mathira's site asked this number to confirm, an hour ago. */
const mathiraAsked = (): Record<string, Row[]> => ({
  people: [{ id: "pm", campaign_id: MATHIRA, phone: PHONE, opted_out: false, tags: ["Volunteer"] }],
  messages: [
    {
      id: "m1",
      campaign_id: MATHIRA,
      person_id: "pm",
      phone: PHONE,
      channel: "sms",
      direction: "out",
      outbox_kind: "consent_check",
      created_at: hoursAgo(1),
    },
  ],
});

const people = (d: ReturnType<typeof db>) => d.tables["people"] ?? [];
const outgoing = (d: ReturnType<typeof db>) =>
  (d.tables["messages"] ?? []).filter((m) => m["direction"] === "out" && m["id"] !== "m1");

async function main() {
  {
    const d = db(mathiraAsked());
    eq("the campaign that texted last", await replyCampaignId(d as never, PHONE), MATHIRA);
    eq(
      "nobody texted: the channel owner",
      await replyCampaignId(d as never, "+254799000000"),
      CHANNEL_CAMPAIGN,
    );
  }
  {
    const seed = mathiraAsked();
    (seed["messages"]![0] as Row)["created_at"] = hoursAgo(24 * 31);
    const d = db(seed);
    eq(
      "a text over 30 days old no longer counts",
      await replyCampaignId(d as never, PHONE),
      CHANNEL_CAMPAIGN,
    );
  }
  {
    // Kalonzo has a short code of its own; the shared line is nobody's.
    const d = db({
      ...mathiraAsked(),
      campaign_channels: [{ campaign_id: "camp-kalonzo", kind: "sms", identifier: "22384" }],
    });
    eq(
      "a campaign's own short code gets what is sent to it",
      await replyCampaignId(d as never, PHONE, "22384"),
      "camp-kalonzo",
    );
    eq(
      "the shared line still goes to whoever texted last",
      await replyCampaignId(d as never, PHONE, "40404"),
      MATHIRA,
    );
  }
  {
    const d = db(mathiraAsked());
    eq("START", await handleInboundSms(d as never, "0712345678", "start"), "opt_in");
    eq("is Mathira's to keep", people(d).find((p) => p["id"] === "pm")?.["consent_sms"], true);
    eq("and adds nobody to the channel owner's list", people(d).length, 1);
    const reply = outgoing(d)[0];
    eq(
      "the confirmation is signed by the campaign that asked",
      String(reply?.["body"]).startsWith("Waruru Gikandi: "),
      true,
    );
    eq("and belongs to it", reply?.["campaign_id"], MATHIRA);
    eq(
      "the reply itself is on Mathira's record",
      (d.tables["messages"] ?? []).find((m) => m["direction"] === "in")?.["campaign_id"],
      MATHIRA,
    );
  }
  {
    const d = db();
    eq(
      "a text from a number nobody texted",
      await handleInboundSms(d as never, "0712345678", "Habari, nataka kusaidia"),
      "inbox",
    );
    eq("goes to the channel owner", people(d)[0]?.["campaign_id"], CHANNEL_CAMPAIGN);
    eq(
      "as a conversation there",
      d.tables["conversations"]?.[0]?.["campaign_id"],
      CHANNEL_CAMPAIGN,
    );
  }
  {
    const seed = mathiraAsked();
    seed["people"]!.push({
      id: "ps",
      campaign_id: CHANNEL_CAMPAIGN,
      phone: PHONE,
      opted_out: false,
      consent_sms: true,
    });
    const d = db(seed);
    eq("STOP", await handleInboundSms(d as never, PHONE, "STOP"), "opt_out");
    eq("stops Mathira", people(d).find((p) => p["id"] === "pm")?.["opted_out"], true);
    eq(
      "and every other campaign on the line",
      people(d).find((p) => p["id"] === "ps")?.["opted_out"],
      true,
    );
    eq(
      "consent gone everywhere",
      people(d).map((p) => p["consent_sms"]),
      [false, false],
    );
    eq(
      "both records say why",
      (d.tables["person_events"] ?? []).filter((e) => e["kind"] === "opt_out").length,
      2,
    );
    eq("one confirmation", outgoing(d).length, 1);
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

void main();
