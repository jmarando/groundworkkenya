// Checks the files crawlers read first (public/robots.txt, sitemap.xml, llms.txt) and the pages that
// must stay out of search, with no network. The live site is checked by `npm run seo:check`
// (scripts/seo/check.mjs). Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/seo.test.ts

import { existsSync, readdirSync, readFileSync } from "node:fs";

import { ksh, TIERS } from "@/lib/pricing";

const SITE = "https://groundwork.ke";
const problems: string[] = [];
const fail = (message: string) => problems.push(message);
const read = (path: string) => readFileSync(path, "utf8");
const today = new Date().toISOString().slice(0, 10);

// sitemap.xml lists only pages meant to be found, written the way the site writes them.
const consolePages = readdirSync("src/routes/_authenticated")
  .filter((f) => f.endsWith(".tsx") && f !== "route.tsx")
  .map((f) => `/${f.replace(/\.tsx$/, "")}`);
const notForSearch = ["/auth", "/set-password", "/api", "/p", "/s", ...consolePages];
const entries = [...read("public/sitemap.xml").matchAll(/<url>([\s\S]*?)<\/url>/g)].map(
  (m) => m[1] ?? "",
);
if (entries.length === 0) fail("sitemap.xml lists no pages");
const seen = new Set<string>();
for (const entry of entries) {
  const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "";
  const path = loc.startsWith(`${SITE}/`) ? loc.slice(SITE.length) : "";
  if (!path) fail(`sitemap.xml: "${loc}" is not a page on ${SITE}`);
  if (seen.has(loc)) fail(`sitemap.xml: ${loc} is listed twice`);
  seen.add(loc);
  if (path.length > 1 && path.endsWith("/")) fail(`sitemap.xml: ${loc} ends in a slash`);
  if (/[?#]/.test(loc)) fail(`sitemap.xml: ${loc} has a query or a fragment`);
  if (notForSearch.some((p) => path === p || path.startsWith(`${p}/`))) {
    fail(`sitemap.xml: ${loc} is not a page for search`);
  }
  if (path.length > 1 && !existsSync(`src/routes/${path.slice(1)}.tsx`)) {
    fail(`sitemap.xml: ${loc} has no page at src/routes${path}.tsx`);
  }
  const lastmod = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod))
    fail(`sitemap.xml: ${loc} needs a lastmod (YYYY-MM-DD)`);
  else if (lastmod > today) fail(`sitemap.xml: ${loc} has a lastmod in the future`);
}

// robots.txt points at the sitemap and shuts out nobody. AI crawlers are allowed on purpose: change
// this on purpose too, not by accident.
const robots = read("public/robots.txt");
if (!new RegExp(`^Sitemap:\\s*${SITE}/sitemap\\.xml\\s*$`, "mi").test(robots)) {
  fail(`robots.txt must point to ${SITE}/sitemap.xml`);
}
if (/^\s*Disallow:\s*\/\s*$/im.test(robots))
  fail("robots.txt shuts a crawler out of the whole site");
for (const bot of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
  if (new RegExp(`^User-agent:\\s*${bot}\\s*$`, "im").test(robots)) {
    fail(`robots.txt names ${bot}: AI crawlers are allowed, so this needs a decision`);
  }
}

// llms.txt opens like the convention says, sends readers nowhere but this site, lists every page in
// the sitemap, and says the prices the pages say.
const landing = read("src/routes/index.tsx");
const llms = read("public/llms.txt");
if (!llms.startsWith("# ")) fail("llms.txt must open with a # title");
if (!/^> .+/m.test(llms)) fail("llms.txt needs a > summary line");
for (const m of llms.matchAll(/\]\((https?:[^)\s]+)\)/g)) {
  if (!(m[1] ?? "").startsWith(`${SITE}/`)) fail(`llms.txt links off the site: ${m[1]}`);
}
for (const m of llms.matchAll(/\]\(https:\/\/groundwork\.ke\/#([a-z-]+)\)/g)) {
  if (!landing.includes(`id="${m[1]}"`))
    fail(`llms.txt links to #${m[1]}, which the home page lacks`);
}
for (const loc of seen) if (!llms.includes(loc)) fail(`llms.txt does not link ${loc}`);
const priced = new Set(TIERS.flatMap((t) => (t.monthly === null ? [] : [ksh(t.monthly)])));
const stated = new Set(llms.match(/KSh [\d,]+/g) ?? []);
for (const price of priced) if (!stated.has(price)) fail(`llms.txt does not state ${price}`);
for (const price of stated) {
  if (!priced.has(price)) {
    fail(`llms.txt states ${price}, which is not a price in src/lib/pricing.ts`);
  }
}

// Prices are written once, in src/lib/pricing.ts.
for (const name of readdirSync("src/routes").filter((f) => f.endsWith(".tsx"))) {
  if (/KSh\s?\d/.test(read(`src/routes/${name}`))) {
    fail(`src/routes/${name} writes a price: take it from src/lib/pricing.ts`);
  }
}

// Each public page gives its own path to pageHead, so its canonical, share cards and markup agree.
for (const loc of seen) {
  const path = loc.slice(SITE.length);
  const file = `src/routes/${path.slice(1)}.tsx`;
  if (path === "/" || path === "/privacy" || !existsSync(file)) continue;
  if (!read(file).includes(`path: "${path}"`)) {
    fail(`${file} must call pageHead with path "${path}"`);
  }
}

// The sign-in screens and the console stay out of search; the home page and /privacy stay in.
const noindex = (file: string) => /name:\s*"robots",\s*content:\s*"noindex"/.test(read(file));
for (const f of [
  "src/routes/auth.tsx",
  "src/routes/set-password.tsx",
  "src/routes/_authenticated/route.tsx",
]) {
  if (!noindex(f)) fail(`${f} must say robots noindex`);
}
for (const f of ["src/routes/index.tsx", "src/routes/privacy.tsx"]) {
  if (noindex(f)) fail(`${f} must stay indexable`);
}

// The FAQ markup and the visible FAQ come from one list (src/lib/faq.ts), on the home page and on
// /faq, and nothing is marked up that the pages do not show.
const faqPage = read("src/routes/faq.tsx");
if (!landing.includes("faqNode(FAQ)") || !landing.includes("FAQ.map(")) {
  fail("index.tsx: the visible FAQ and the FAQPage markup must both be built from FAQ");
}
if (!faqPage.includes("faqNode(FAQ)") || !faqPage.includes("items={FAQ}")) {
  fail("faq.tsx: the visible questions and the FAQPage markup must both be built from FAQ");
}
if (/aggregateRating|review:/.test(landing)) {
  fail("index.tsx: ratings and reviews are not shown on the page, so they are not marked up");
}
if (/offers:/.test(landing) && !/offers:\s*priceOffers\(/.test(landing)) {
  fail("index.tsx: offers must come from priceOffers(), which uses the prices the page shows");
}

// Screenshots below the first screen load when scrolled to, with their size stated.
if ((landing.match(/loading="lazy"/g) ?? []).length < 7) {
  fail("index.tsx: the seven screenshots below the first screen should be loading=lazy");
}

for (const p of problems) console.log(`FAIL ${p}`);
console.log(`${entries.length} sitemap pages, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
