// Checks for turning the atlas's files into a migration: quoting, the order
// the foreign keys need, ids, upserts and chunking. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-sql.test.ts

import { emptyFiles, readTable } from "@/lib/atlas-files";
import { atlasSql } from "@/lib/atlas-sql";

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

const f = emptyFiles();
readTable(
  "sources",
  "id,title,publisher,url,note\niebc-test,Kenya's register (test),IEBC,,\n",
  "sources",
  f,
);
readTable(
  "areas",
  "key,level,name,parent,iebc_code\nnairobi/kibra,constituency,Kibra,nairobi,\nnairobi,county,Nairobi,kenya,047\nkenya,country,Kenya,,\n",
  "areas",
  f,
);
readTable(
  "candidates",
  "election,seat,name,party,bloc\n2022-governor,nairobi,Ann Ng'ang'a,UDA,Kenya Kwanza\n",
  "candidates",
  f,
);
readTable(
  "results",
  "election,seat,candidate,area,votes,source\n2022-governor,nairobi,Ann Ng'ang'a,nairobi/kibra,12,iebc-test\n",
  "results",
  f,
);
const sql = atlasSql(f);
const at = (s: string) => sql.indexOf(s);

eq("quotes are doubled", sql.includes("'Kenya''s register (test)'"), true);
eq(
  "parents go in before their children",
  at("('kenya'") < at("('nairobi'") && at("('nairobi'") < at("('nairobi/kibra'"),
  true,
);
eq(
  "sources and areas before candidates, candidates before results",
  at("atlas_sources") < at("atlas_areas") && at("atlas_candidates") < at("atlas_results"),
  true,
);
eq("the candidate's id", sql.includes("'2022-governor:nairobi:ann-ng-ang-a'"), true);
eq(
  "upserts",
  sql.includes(
    "on conflict (candidate_id, area_key) do update set votes = excluded.votes, source_id = excluded.source_id;",
  ),
  true,
);
eq("an empty cell is null", sql.includes("'Kibra', 'nairobi', null)"), true);
eq("an empty table is left out", sql.includes("atlas_population"), false);

const many = emptyFiles();
readTable(
  "register",
  `year,area,registered,source\n${Array.from({ length: 501 }, (_, i) => `2022,w${i},1,s`).join("\n")}`,
  "register",
  many,
);
eq(
  "long tables go in 500 rows at a time",
  (atlasSql(many).match(/insert into public\.atlas_register/g) ?? []).length,
  2,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
