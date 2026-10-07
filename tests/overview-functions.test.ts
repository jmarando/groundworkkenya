// Checks for the live overview Home shows once a campaign has real people:
// sample people never count, and each ward's gap is its real consented
// supporters against its target. Against a stand-in database; nothing leaves
// this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/overview-functions.test.ts

import { loadOverview } from "@/lib/overview.functions";

import { fakeSupabase } from "./fake-supabase";

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

const now = new Date().toISOString();
const person = (id: string, ward: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  campaign_id: "c2",
  phone: `+2547000000${id.slice(1)}`,
  ward_id: ward,
  consent_sms: true,
  opted_out: false,
  tags: [],
  created_at: now,
  ...extra,
});

const sb = fakeSupabase({
  wards: [
    {
      id: "w1",
      campaign_id: "c2",
      name: "Kangemi",
      constituency: "Westlands",
      supporters: 9000,
      target_votes: 3,
    },
    {
      id: "w2",
      campaign_id: "c2",
      name: "Karura",
      constituency: "Westlands",
      supporters: 9000,
      target_votes: 1,
    },
  ],
  people: [
    person("p1", "w1"),
    person("p2", "w1", { tags: ["sample"] }),
    person("p3", "w2", { consent_sms: false }),
    person("p4", "w2", { opted_out: true }),
    person("p5", "w1", { tags: ["vip"] }),
    person("p6", "w2", { tags: ["sample", "vip"] }),
  ],
});

const o = await loadOverview(sb as never);
eq("consented supporters: real people only", o.supporters, 2);
eq("people on file: real people only", o.quick.people, 4);
eq(
  "each ward's gap: its real consented supporters against its target, not a stored figure",
  [o.wardsOnTrack, o.wardsTotal, o.biggestGap, o.offPace.map((w) => [w.name, w.gap])],
  [
    0,
    2,
    { name: "Kangemi", constituency: "Westlands", gap: -1 },
    [
      ["Kangemi", -1],
      ["Karura", -1],
    ],
  ],
);
eq("growth counts real supporters", o.growth[o.growth.length - 1]?.value, 2);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
