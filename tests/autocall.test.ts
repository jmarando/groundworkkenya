// Checks for what an auto-call plays: the recording, the disclosure, press 9 to stop.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/autocall.test.ts

import { autocallTwiml, spokenScript } from "@/lib/autocall";

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
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const base = { script: "Join us Saturday.", language: "en" as const, disclose: true };
const clone = autocallTwiml({
  blast: { ...base, source: "clone", audio_url: "https://x.supabase.co/a.mp3" },
  who: "Gathoni Wamuchomba",
  keyUrl: "https://groundwork.ke/k?a=1&b=2",
  escape: esc,
});
eq(
  "the clone plays its audio inside a Gather",
  clone.startsWith('<Gather numDigits="1"') &&
    clone.includes("<Play>https://x.supabase.co/a.mp3</Play>"),
  true,
);
eq(
  "the clone's disclosure is in its audio, not said again",
  clone.includes("recorded message"),
  false,
);
eq("press 9 to stop", clone.includes("To stop these calls, press 9."), true);
eq("the key address escaped", clone.includes("k?a=1&amp;b=2"), true);
const upload = autocallTwiml({
  blast: { ...base, source: "upload", audio_url: "https://x/a.mp3" },
  who: "Sakaja",
  keyUrl: "https://k",
  escape: esc,
});
eq(
  "a recording is introduced first",
  upload.indexOf("This is a recorded message from Sakaja's campaign.") < upload.indexOf("<Play>"),
  true,
);
const std = autocallTwiml({
  blast: { ...base, source: "standard", audio_url: null },
  who: "X",
  keyUrl: "https://k",
  escape: esc,
});
eq("a standard voice reads the script", std.includes(">Join us Saturday.</Say>"), true);
eq(
  "nothing to play, hang up",
  autocallTwiml({
    blast: { ...base, source: "clone", audio_url: null },
    who: "X",
    keyUrl: "https://k",
    escape: esc,
  }),
  "<Hangup/>",
);
eq(
  "Kiswahili stop line",
  autocallTwiml({
    blast: { ...base, language: "sw", source: "upload", audio_url: "https://a" },
    who: "X",
    keyUrl: "https://k",
    escape: esc,
  }).includes("bonyeza 9"),
  true,
);
eq(
  "the clone speaks the disclosure first",
  spokenScript(base, "Gathoni Wamuchomba"),
  "This is a recorded message from Gathoni Wamuchomba's campaign. Join us Saturday.",
);
eq("disclosure off", spokenScript({ ...base, disclose: false }, "X"), "Join us Saturday.");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
