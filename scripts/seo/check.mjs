#!/usr/bin/env node
// Checks the public site the way a crawler that does not run JavaScript meets it, one line per check.
//
//   node scripts/seo/check.mjs                              # https://groundwork.ke
//   node scripts/seo/check.mjs --base http://127.0.0.1:5199 # a dev server or preview (skips the host checks)
//   node scripts/seo/check.mjs --json
//
// FAIL: something a crawler needs is missing or wrong, and the run exits 1. WARN: worth fixing, never
// fails the run. Needs Node 18 or later and no packages. The static files in public/ are also checked,
// with no network, by tests/seo.test.ts.

import { createHash } from "node:crypto";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);

const SITE = "https://groundwork.ke";
const BASE = option("--base", SITE).replace(/\/+$/, "");
const LOCAL = BASE !== SITE;

const AGENTS = {
  browser:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  GPTBot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
  ClaudeBot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  PerplexityBot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};
// The crawlers robots.txt is read for. AI crawlers are allowed on purpose: say so here if that changes.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];
const SEARCH_CRAWLERS = ["Googlebot", "Bingbot"];

const results = [];
const note = (status) => (id, detail) => results.push({ status, id, detail });
const pass = note("PASS");
const warn = note("WARN");
const fail = note("FAIL");

async function get(url, { agent = "browser", manual = false } = {}) {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      redirect: manual ? "manual" : "follow",
      headers: { "user-agent": AGENTS[agent] ?? agent },
    });
    const type = res.headers.get("content-type") ?? "";
    const text = /text|xml|json/.test(type) ? await res.text() : "";
    return {
      status: res.status,
      type,
      text,
      headers: res.headers,
      ms: performance.now() - started,
    };
  } catch (error) {
    const reason = error?.cause?.code ?? error?.message ?? String(error);
    return { status: 0, type: "", text: "", headers: new Headers(), ms: 0, error: reason };
  }
}
const shown = (r) => r.status || r.error;

const decode = (s = "") =>
  s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const attrOf = (tag, name) =>
  decode(tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1]);
const tagsOf = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
const metaOf = (html, key, by = "name") => {
  const tag = tagsOf(html, "meta").find((t) => attrOf(t, by).toLowerCase() === key);
  return tag ? attrOf(tag, "content") : undefined;
};
const linkOf = (html, rel) => {
  const tag = tagsOf(html, "link").find((t) => attrOf(t, "rel") === rel);
  return tag ? attrOf(tag, "href") : undefined;
};
const titleOf = (html) => decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
const visibleText = (html) =>
  decode(
    html
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
const textHash = (html) =>
  createHash("sha256").update(visibleText(html)).digest("hex").slice(0, 12);
const jsonLd = (html) =>
  [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ].flatMap((m) => {
    try {
      const data = JSON.parse(m[1]);
      return data["@graph"] ?? [data];
    } catch {
      return [{ "@type": "INVALID JSON" }];
    }
  });

// A small robots.txt reader: the group for the most specific user agent, then the longest rule wins.
function robotsAllows(robots, agent, path = "/") {
  const groups = [];
  let group = null;
  let afterAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const name = key.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (name === "user-agent") {
      if (!afterAgent) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
      afterAgent = true;
    } else {
      if (group && (name === "allow" || name === "disallow")) {
        group.rules.push({ allow: name === "allow", value });
      }
      afterAgent = false;
    }
  }
  const me = agent.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a !== "*" && me.includes(a)));
  const applies = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  let best = { length: -1, allow: true };
  for (const g of applies) {
    for (const rule of g.rules) {
      if (rule.value === "" || !path.startsWith(rule.value)) continue;
      const longer = rule.value.length > best.length;
      if (longer || (rule.value.length === best.length && rule.allow)) {
        best = { length: rule.value.length, allow: rule.allow };
      }
    }
  }
  return best.allow;
}

async function main() {
  const home = await get(`${BASE}/`);
  if (home.status !== 200) {
    fail("home", `${BASE}/ answered ${shown(home)}`);
    return;
  }
  const html = home.text;

  // What a crawler without JavaScript gets.
  const words = visibleText(html).split(" ").length;
  const questions = [...html.matchAll(/<summary[^>]*>([^<]*)<\/summary>/gi)].map((m) =>
    decode(m[1]).trim(),
  );
  if (words >= 800 && /<h1\b/i.test(html) && questions.length >= 8) {
    pass(
      "render-no-js",
      `${words} words, an h1 and ${questions.length} FAQ answers in the raw HTML`,
    );
  } else {
    fail("render-no-js", `${words} words and ${questions.length} FAQ answers in the raw HTML`);
  }
  const differs = [];
  for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Googlebot"]) {
    const r = await get(`${BASE}/`, { agent: bot });
    if (r.status !== 200 || textHash(r.text) !== textHash(html))
      differs.push(`${bot} (${shown(r)})`);
  }
  if (differs.length) fail("bots-see-same", `blocked or different: ${differs.join(", ")}`);
  else {
    pass(
      "bots-see-same",
      "GPTBot, ClaudeBot, PerplexityBot and Googlebot agents get the same text",
    );
  }

  // The head.
  const title = titleOf(html);
  const titleDetail = `${title.length} chars: ${title || "missing"}`;
  if (title.length >= 20 && title.length <= 65) pass("title", titleDetail);
  else (title ? warn : fail)("title", titleDetail);
  const description = metaOf(html, "description") ?? "";
  const descriptionDetail = `${description.length} chars`;
  if (description.length >= 70 && description.length <= 170) pass("description", descriptionDetail);
  else (description ? warn : fail)("description", descriptionDetail);
  const canonical = linkOf(html, "canonical");
  if (canonical === `${SITE}/`) pass("canonical", canonical);
  else fail("canonical", `${canonical ?? "missing"}, expected ${SITE}/`);
  const cards = [
    ["og:title", metaOf(html, "og:title", "property")],
    ["og:description", metaOf(html, "og:description", "property")],
    ["og:image", metaOf(html, "og:image", "property")],
    ["og:url", metaOf(html, "og:url", "property")],
    ["twitter:card", metaOf(html, "twitter:card")],
  ];
  const noCard = cards.filter(([, v]) => !v).map(([k]) => k);
  if (noCard.length) fail("social-cards", `missing ${noCard.join(", ")}`);
  else pass("social-cards", "Open Graph and Twitter card tags are set");
  const imageUrl = metaOf(html, "og:image", "property");
  if (imageUrl) {
    const res = await fetch(imageUrl, { headers: { "user-agent": AGENTS.browser } }).catch(
      () => null,
    );
    const bytes = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
    if (!bytes) fail("social-image", `${imageUrl} did not load`);
    else {
      const png = bytes.subarray(1, 4).toString() === "PNG";
      const size = png ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` : "size unread";
      const detail = `${size}, ${Math.round(bytes.length / 1024)} KB`;
      if (bytes.length <= 300 * 1024) pass("social-image", detail);
      else warn("social-image", `${detail}: WhatsApp may not show images over 300 KB`);
    }
  }
  const h1s = (html.match(/<h1\b/gi) ?? []).length;
  if (h1s === 1) pass("one-h1", "one h1");
  else fail("one-h1", `${h1s} h1 headings`);
  if (/noindex/i.test(metaOf(html, "robots") ?? ""))
    fail("home-indexable", "the home page says noindex");
  else pass("home-indexable", "the home page can be indexed");

  // Structured data.
  const nodes = jsonLd(html);
  const types = nodes.map((n) => n["@type"]);
  const lacking = ["Organization", "SoftwareApplication", "FAQPage"].filter(
    (t) => !types.includes(t),
  );
  if (lacking.length) fail("json-ld", `missing ${lacking.join(", ")}`);
  else if (!types.includes("WebSite")) warn("json-ld", `${types.join(", ")}; no WebSite node`);
  else pass("json-ld", types.join(", "));
  const marked = (nodes.find((n) => n["@type"] === "FAQPage")?.mainEntity ?? []).map((q) => q.name);
  if (marked.length === questions.length && marked.every((q) => questions.includes(q))) {
    pass("faq-matches", `${marked.length} questions, the same as the visible FAQ`);
  } else {
    fail("faq-matches", `markup has ${marked.length}, the page shows ${questions.length}`);
  }
  if (/aggregateRating|"review"|"offers"/.test(JSON.stringify(nodes))) {
    fail(
      "no-invented-markup",
      "ratings, reviews or offers are marked up but not shown on the page",
    );
  } else pass("no-invented-markup", "no ratings, reviews or offers");

  // The files crawlers read first.
  const robots = await get(`${BASE}/robots.txt`);
  if (robots.status !== 200) fail("robots-txt", `answered ${shown(robots)}`);
  else {
    const shut = SEARCH_CRAWLERS.filter((b) => !robotsAllows(robots.text, b));
    const blocked = AI_CRAWLERS.filter((b) => !robotsAllows(robots.text, b));
    const hasSitemap = new RegExp(`^sitemap:\\s*${SITE}/sitemap\\.xml\\s*$`, "im").test(
      robots.text,
    );
    if (shut.length) fail("robots-txt", `shuts out ${shut.join(", ")}`);
    else if (!hasSitemap) fail("robots-txt", `no "Sitemap: ${SITE}/sitemap.xml" line`);
    else if (blocked.length) warn("robots-txt", `blocks ${blocked.join(", ")}: on purpose?`);
    else
      pass(
        "robots-txt",
        `names the sitemap and allows search and ${AI_CRAWLERS.length} AI crawlers`,
      );
  }
  const sitemap = await get(`${BASE}/sitemap.xml`);
  if (sitemap.status !== 200) fail("sitemap", `answered ${shown(sitemap)}`);
  else {
    const entries = [...sitemap.text.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
    const locs = entries.map((e) => e.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "");
    const bad = [];
    for (const loc of locs) {
      const r = await get(loc.replace(SITE, BASE));
      const hidden = /noindex/i.test(metaOf(r.text, "robots") ?? "");
      if (!loc.startsWith(`${SITE}/`) || r.status !== 200 || hidden)
        bad.push(`${loc} (${shown(r)})`);
    }
    const undated = entries.filter((e) => !/<lastmod>/.test(e)).length;
    if (!locs.length || bad.length)
      fail("sitemap", `${locs.length} pages; not found or not indexable: ${bad.join(", ")}`);
    else if (undated)
      warn("sitemap", `${locs.length} pages, all indexable; ${undated} without a lastmod`);
    else pass("sitemap", `${locs.length} pages, all 200, indexable, each with a lastmod`);
  }
  const llms = await get(`${BASE}/llms.txt`);
  if (llms.status !== 200) fail("llms-txt", `/llms.txt answered ${shown(llms)}`);
  else if (!llms.text.startsWith("# ")) fail("llms-txt", "does not open with a # title");
  else {
    const off = [...llms.text.matchAll(/\]\((https?:[^)\s]+)\)/g)].filter(
      (m) => !m[1].startsWith(`${SITE}/`),
    );
    if (off.length) fail("llms-txt", `links off the site: ${off.map((m) => m[1]).join(", ")}`);
    else pass("llms-txt", `${llms.text.split(/\s+/).length} words, links stay on the site`);
  }

  // Pages that are not for search, and a path that is not a page.
  const open = [];
  for (const path of ["/auth", "/set-password", "/home"]) {
    const r = await get(`${BASE}${path}`);
    if (!/noindex/i.test(metaOf(r.text, "robots") ?? "")) open.push(path);
  }
  if (open.length) fail("noindex-app", `${open.join(", ")} can be indexed`);
  else pass("noindex-app", "/auth, /set-password and the console say noindex");
  const gone = await get(`${BASE}/no-such-page-${Date.now()}`);
  if (gone.status === 404) pass("not-found", "an unknown path answers 404");
  else fail("not-found", `an unknown path answers ${shown(gone)}`);

  // Hosts and redirects (the real hosts only).
  if (!LOCAL) {
    const hop = async (url) => {
      const r = await get(url, { manual: true });
      const to = r.headers.get("location");
      return { status: r.status, error: r.error, to: to ? new URL(to, url).href : "" };
    };
    const secure = await hop("http://groundwork.ke/");
    if (secure.status === 301 && secure.to === `${SITE}/`)
      pass("http-to-https", `301 to ${secure.to}`);
    else fail("http-to-https", `http://groundwork.ke/ answers ${shown(secure)} ${secure.to}`);
    for (const host of ["www.groundwork.ke", "groundworkkenya.lovable.app"]) {
      const r = await hop(`https://${host}/`);
      if ([301, 308].includes(r.status) && r.to.startsWith(`${SITE}/`))
        pass(`redirect:${host}`, `${r.status} to ${r.to}`);
      else if (r.status === 200)
        warn(
          `redirect:${host}`,
          "serves a full copy of the home page (its canonical points at the apex)",
        );
      else warn(`redirect:${host}`, `answers ${shown(r)} ${r.to}`);
    }
    const slash = await hop(`${SITE}/privacy/`);
    if ([301, 308].includes(slash.status))
      pass("trailing-slash", `/privacy/ answers ${slash.status}`);
    else warn("trailing-slash", `/privacy/ answers ${shown(slash)}, a temporary redirect`);
  }

  // Speed, as a crawler or a phone on a slow line feels it.
  const times = [];
  for (let i = 0; i < 3; i++) times.push((await get(`${BASE}/`)).ms);
  const median = Math.round(times.sort((a, b) => a - b)[1]);
  const speed = `median ${median} ms for the whole home page response`;
  if (median < 800) pass("response-time", speed);
  else (median < 1500 ? warn : fail)("response-time", speed);
  const preloads = tagsOf(html, "link").filter(
    (t) => attrOf(t, "rel") === "preload" && attrOf(t, "as") === "image",
  ).length;
  if (preloads <= 2) pass("image-preloads", `${preloads} images preloaded`);
  else warn("image-preloads", `${preloads} images preloaded: only the first screen's should be`);
  const imgs = tagsOf(html, "img");
  const eager = imgs.slice(1).filter((t) => attrOf(t, "loading") !== "lazy").length;
  const unsized = imgs.filter((t) => !attrOf(t, "width") || !attrOf(t, "height")).length;
  if (eager === 0 && unsized === 0)
    pass("images", `${imgs.length} images: lazy below the first screen, all sized`);
  else
    warn(
      "images",
      `${eager} below the first screen load at once; ${unsized} have no width and height`,
    );
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  if (kb < 100) pass("html-size", `${kb} KB of HTML`);
  else warn("html-size", `${kb} KB of HTML`);
}

await main();
if (flag("--json")) console.log(JSON.stringify(results, null, 2));
else {
  const width = Math.max(...results.map((r) => r.id.length));
  for (const r of results) console.log(`${r.status}  ${r.id.padEnd(width)}  ${r.detail}`);
  const count = (status) => results.filter((r) => r.status === status).length;
  console.log(`\n${count("PASS")} pass, ${count("WARN")} warn, ${count("FAIL")} fail  (${BASE})`);
}
process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
