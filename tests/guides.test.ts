// Checks for the guides under /guides: each has a route that gives pageHead its own path, a title and a
// description of a sensible length, a sitemap entry dated the day its facts were checked, a line in
// llms.txt and a link from the site's footers; and nothing in the guides writes a price or links off the
// site except through a Source. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/guides.test.ts

import { existsSync, readdirSync, readFileSync } from "node:fs";

import { CHECKED, GUIDES } from "@/lib/guides";

const SITE = "https://groundwork.ke";
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

const read = (path: string) => readFileSync(path, "utf8");
const sitemap = read("public/sitemap.xml");
const llms = read("public/llms.txt");
const lastmodOf = (path: string) =>
  sitemap.match(new RegExp(`<loc>${SITE}${path}</loc>\\s*<lastmod>([^<]+)</lastmod>`))?.[1];

eq("the check date is a day", /^\d{4}-\d{2}-\d{2}$/.test(CHECKED), true);
eq("the check date is not in the future", CHECKED <= new Date().toISOString().slice(0, 10), true);

for (const g of GUIDES) {
  const file = `src/routes/guides/${g.path.slice("/guides/".length)}.tsx`;
  const src = existsSync(file) ? read(file) : "";
  eq(`${g.path}: has its route file`, existsSync(file), true);
  eq(`${g.path}: gives pageHead its own path`, src.includes(`path: "${g.path}"`), true);
  eq(
    `${g.path}: takes its title and description from GUIDES`,
    src.includes("title: GUIDE.title") && src.includes("description: GUIDE.description"),
    true,
  );
  eq(
    `${g.path}: a title of 30 to 70 characters`,
    g.title.length >= 30 && g.title.length <= 70,
    true,
  );
  eq(
    `${g.path}: a description of 90 to 175 characters`,
    g.description.length >= 90 && g.description.length <= 175,
    true,
  );
  eq(`${g.path}: in the sitemap, dated the day it was checked`, lastmodOf(g.path), CHECKED);
  eq(`${g.path}: in llms.txt`, llms.includes(`](${SITE}${g.path})`), true);
  eq(
    `${g.path}: shows when it was checked and its sources`,
    src.includes("<Checked />") && src.includes("<Sources"),
    true,
  );
}

// The index page.
const index = existsSync("src/routes/guides/index.tsx") ? read("src/routes/guides/index.tsx") : "";
eq("/guides: has its page", index.includes('path: "/guides"'), true);
eq("/guides: in the sitemap, dated the day the guides were checked", lastmodOf("/guides"), CHECKED);
eq("/guides: in llms.txt", llms.includes(`](${SITE}/guides)`), true);

// Both footers link the index and every guide, so each page is one click from the home page.
for (const file of ["src/routes/index.tsx", "src/components/gw/landing/PublicPage.tsx"]) {
  const src = read(file);
  for (const path of ["/guides", ...GUIDES.map((g) => g.path)]) {
    eq(`${file}: the footer links ${path}`, src.includes(`to="${path}"`), true);
  }
}

// Nothing in the guides writes a price, and a link off the site comes from a Source, which carries its date.
for (const f of readdirSync("src/routes/guides").filter((name) => name.endsWith(".tsx"))) {
  const src = read(`src/routes/guides/${f}`);
  eq(`${f}: writes no price`, /KSh\s?\d/.test(src), false);
  eq(`${f}: links off the site only through a Source`, /href="https?:/.test(src), false);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
