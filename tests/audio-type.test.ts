// Checks that recordings are taken in the shapes phones save them: a WhatsApp voice note as .mp4
// (often labelled video/mp4 or with no type), M4A, MP3 and WAV; anything else is refused.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/audio-type.test.ts

import { audioType } from "@/lib/autocall.functions";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  }
}

eq("WhatsApp voice note labelled video", audioType("WhatsApp Audio.mp4", "video/mp4"), "audio/mp4");
eq("voice note with no type", audioType("note.m4a", ""), "audio/mp4");
eq("mp3 as given", audioType("a.mp3", "audio/mpeg"), "audio/mpeg");
eq("mp3 with no type", audioType("a.mp3", "application/octet-stream"), "audio/mpeg");
eq("a picture refused", audioType("a.jpg", "image/jpeg"), null);
eq("a real video type other than mp4 refused", audioType("a.mov", "video/quicktime"), null);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
