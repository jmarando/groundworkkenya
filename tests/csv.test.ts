// Checks for the CSV export: quoting, and text a spreadsheet would run as a formula.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/csv.test.ts

import { cell, toCSV } from "@/lib/csv";

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

eq("plain text", cell("Kileleshwa"), "Kileleshwa");
eq("empty", [cell(null), cell(undefined)], ["", ""]);
eq("commas and quotes are quoted", cell('Say "hi", then go'), '"Say ""hi"", then go"');
eq(
  "a formula is defused",
  cell('=HYPERLINK("http://x","click")'),
  `"'=HYPERLINK(""http://x"",""click"")"`,
);
eq(
  "so are + - @ and a leading tab",
  [cell("+cmd"), cell("-2+3"), cell("@SUM(A1)"), cell("\tx")],
  ["'+cmd", "'-2+3", "'@SUM(A1)", "'\tx"],
);
eq(
  "phone numbers and negatives stay as they are",
  [cell("+254712345678"), cell("-1.2864"), cell(-1.28)],
  ["+254712345678", "-1.2864", "-1.28"],
);
eq("a row", toCSV(["a", "b"], [["=1+1", 2]]), "a,b\r\n'=1+1,2");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
