// Checks for reading TwitterAPI.io's advanced search: links from ids, authors as handles, views
// and reposts as numbers, anything malformed dropped.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/x-read.test.ts

import { readXSearch } from "@/lib/x-read";

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

const hits = readXSearch({
  tweets: [
    {
      id: "1848000000000000001",
      text: "Githunguri dairy farmers waiting 3 months for pay\\nWho answers?",
      createdAt: "Tue Oct 20 07:00:30 +0000 2026",
      viewCount: 12500,
      retweetCount: 40,
      quoteCount: 5,
      author: { userName: "kiambu_voice", name: "Kiambu Voice", followers: 30000 },
    },
    { id: "not-a-number", text: "x", author: { userName: "a" } },
    { id: "1848000000000000002", text: "no author" },
    { id: "1848000000000000003", text: "bad handle", author: { userName: "javascript:alert(1)" } },
    { id: "1848000000000000004", text: "", viewCount: -5, author: { userName: "quiet" } },
  ],
});
eq("only well-formed posts", hits.length, 2);
eq("link from the id", hits[0]!.url, "https://x.com/kiambu_voice/status/1848000000000000001");
eq("author as a handle", hits[0]!.author, "@kiambu_voice");
eq("views and reposts", [hits[0]!.reach, hits[0]!.shares], [12500, 45]);
eq("published time read", hits[0]!.publishedAt, "2026-10-20T07:00:30.000Z");
eq("no negative counts, no empty text", [hits[1]!.reach, hits[1]!.title], [null, null]);
eq("not an answer: nothing", readXSearch({ error: "x" }), []);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
