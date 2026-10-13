// Checks for which wards a campaign's public site offers. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/site-wards.test.ts

import { MAX_WARDS, siteWards } from "@/lib/site/wards";

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

const three = [{ id: "a" }, { id: "b" }, { id: "c" }];
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

eq("a governor's site offers its wards", siteWards("governor", three), three);
eq("so does an MP's", siteWards("mp", three).length, 3);
eq("a campaign with no level set still does", siteWards(null, three).length, 3);
eq("a presidential campaign's offers none", siteWards("president", three), []);
eq("no list, none", siteWards("mp", null), []);
eq("a list at the limit still shows", siteWards("governor", many(MAX_WARDS)).length, MAX_WARDS);
eq("one past it, none", siteWards("governor", many(MAX_WARDS + 1)), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
