// Checks for what may be asked of Listening's posts by date: a few posts by id, or a run of
// Nairobi days a page at a time. Anything else is refused before the database is asked.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/posts-query.test.ts

import { decodeCursor, encodeCursor, parsePostsQuery } from "@/lib/posts-query";

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

function refuses(name: string, input: unknown) {
  try {
    parsePostsQuery(input);
    fail++;
    console.log(`FAIL ${name}\n  it was accepted`);
  } catch {
    pass++;
  }
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---- by id
eq("ids pass through", parsePostsQuery({ ids: [id(1), id(2)] }), { ids: [id(1), id(2)] });
eq("junk ids are dropped", parsePostsQuery({ ids: [id(1), "nope", 7, null, "x'; drop table"] }), {
  ids: [id(1)],
});
eq("duplicates are dropped", parsePostsQuery({ ids: [id(1), id(1), id(2)] }), {
  ids: [id(1), id(2)],
});
eq(
  "at most 200 ids",
  (parsePostsQuery({ ids: Array.from({ length: 250 }, (_, i) => id(i)) }) as { ids: string[] }).ids
    .length,
  200,
);
refuses("no usable ids", { ids: ["nope"] });
refuses("an empty list of ids", { ids: [] });
refuses("ids that are not a list", { ids: id(1) });

// ---- by day
eq("a run of days passes through", parsePostsQuery({ from: "2026-10-01", to: "2026-10-29" }), {
  from: "2026-10-01",
  to: "2026-10-29",
});
eq("one day is a run", parsePostsQuery({ from: "2026-10-29", to: "2026-10-29" }), {
  from: "2026-10-29",
  to: "2026-10-29",
});
refuses("backwards", { from: "2026-10-29", to: "2026-10-01" });
refuses("not a date", { from: "yesterday", to: "2026-10-29" });
refuses("a day that is not on the calendar", { from: "2026-02-30", to: "2026-03-02" });
refuses("a time instead of a day", { from: "2026-10-01T00:00:00Z", to: "2026-10-02" });
refuses("a missing end", { from: "2026-10-01" });
eq("400 days is the most", !!parsePostsQuery({ from: "2026-01-01", to: "2027-02-04" }), true);
refuses("401 days is too many", { from: "2026-01-01", to: "2027-02-05" });

// ---- cursors
const at = "2026-10-29T10:00:00+00:00";
eq("a cursor round-trips", decodeCursor(encodeCursor(at, id(5))), { foundAt: at, id: id(5) });
eq(
  "fractions of a second are fine",
  decodeCursor(encodeCursor("2026-10-29T10:00:00.123456+00:00", id(5)))?.foundAt,
  "2026-10-29T10:00:00.123456+00:00",
);
eq("junk is no cursor", decodeCursor("junk"), null);
eq("a cursor with a bad id is none", decodeCursor(`${at}|nope`), null);
eq("a cursor with an injected filter is none", decodeCursor(`${at}|${id(5)},id.gt.0`), null);
eq(
  "a good cursor rides along",
  parsePostsQuery({ from: "2026-10-01", to: "2026-10-29", cursor: encodeCursor(at, id(5)) }),
  { from: "2026-10-01", to: "2026-10-29", cursor: encodeCursor(at, id(5)) },
);
refuses("a bad cursor is refused", { from: "2026-10-01", to: "2026-10-29", cursor: "junk" });

refuses("nothing asked", {});
refuses("not an object", null);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
