// Checks for the short numbers on the Listening screens.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/format.test.ts

import { dayTime, short } from "@/lib/format";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  if (got === want) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${String(got)}\n  want ${String(want)}`);
  }
}

eq("under a thousand is as it is", short(950), "950");
eq("zero", short(0), "0");
eq("a thousand", short(1000), "1k");
eq("a tenth of a thousand shows", short(4200), "4.2k");
eq("five thousand", short(5000), "5k");
eq("ten thousand and over round to whole thousands", short(121_400), "121k");
eq("408,000", short(408_000), "408k");
eq("just under a million does not read 1000k", short(999_700), "1M");
eq("a million and a bit", short(1_400_000), "1.4M");
eq("millions", short(6_800_000), "6.8M");
eq("a fraction is rounded", short(949.6), "950");

eq("the day and time in Nairobi", dayTime("2026-10-27T11:05:00Z"), "Tue 14:05");
eq("a late hour crosses into the next Nairobi day", dayTime("2026-10-27T21:30:00Z"), "Wed 00:30");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
