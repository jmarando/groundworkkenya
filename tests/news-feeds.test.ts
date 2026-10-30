// Checks for the free news sources: reading an outlet's feed or a Google News search into stories,
// and which stories answer a keyword's search. Pure; nothing leaves this process. Invented stories
// only. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/news-feeds.test.ts

import {
  fold,
  googleNewsStories,
  matchesSearch,
  OUTLET_FEEDS,
  parseFeed,
  recent,
  searchFor,
  storiesFor,
  titleKey,
} from "@/lib/news-feeds";

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

// ------------------------------------------------------------ reading a feed

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item>
  <title><![CDATA[Water rationing in Kijiji ward: residents &amp; the county]]></title>
  <link>https://outlet.test/news/water-rationing</link>
  <pubDate>Fri, 30 Oct 2026 06:30:00 +0300</pubDate>
  <description><![CDATA[<p>Taps in <b>Kijiji</b> have been dry since Monday.&nbsp;The county says tankers are coming.</p>]]></description>
</item>
<item>
  <title>No link here, so it is left out</title>
  <description>Nothing to open.</description>
</item>
<item>
  <title>Only a guid</title>
  <guid>https://outlet.test/news/guid-only</guid>
  <dc:date>2026-10-29T10:00:00Z</dc:date>
</item>
<item>
  <title>Undated story</title>
  <link>https://outlet.test/news/undated</link>
  <content:encoded><![CDATA[<div>Full text of the undated story.</div>]]></content:encoded>
</item>
</channel></rss>`;

const stories = parseFeed(RSS);
eq("three stories with an address", stories.length, 3);
eq(
  "a headline is read without its CDATA or entities",
  stories[0]?.title,
  "Water rationing in Kijiji ward: residents & the county",
);
eq(
  "the summary loses its tags and its entities",
  stories[0]?.snippet,
  "Taps in Kijiji have been dry since Monday. The county says tankers are coming.",
);
eq("the date is kept as an instant", stories[0]?.publishedAt, "2026-10-30T03:30:00.000Z");
eq(
  "a story with no link element uses its guid",
  stories[1]?.url,
  "https://outlet.test/news/guid-only",
);
eq("dc:date counts as a date", stories[1]?.publishedAt, "2026-10-29T10:00:00.000Z");
eq(
  "content:encoded stands in for a summary",
  stories[2]?.snippet,
  "Full text of the undated story.",
);
eq("an undated story stays undated", stories[2]?.publishedAt, null);

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <title type="html">Bursary forms open at the ward office</title>
  <link rel="alternate" href="https://atom.test/bursary"/>
  <updated>2026-10-28T08:15:00Z</updated>
  <summary>Forms close on Friday.</summary>
</entry></feed>`;
const atom = parseFeed(ATOM);
eq("an Atom entry is read by its href", atom[0]?.url, "https://atom.test/bursary");
eq("an Atom entry's updated is its date", atom[0]?.publishedAt, "2026-10-28T08:15:00.000Z");
eq("an Atom summary is its snippet", atom[0]?.snippet, "Forms close on Friday.");
eq(
  "something that is not a feed has no stories",
  parseFeed("<html><body>Not a feed</body></html>"),
  [],
);

// --------------------------------------------------------------- the keywords

eq("folding drops accents, apostrophes and case", fold("Matiang’i, Kiambu!"), "matiangi kiambu");

const plainSearch = searchFor({ query: "Sakaja Nairobi governor" });
eq("every word of a plain search is needed", plainSearch.all, [
  ["sakaja"],
  ["nairobi"],
  ["governor"],
]);
eq(
  "a story with every word answers it",
  matchesSearch("Governor Sakaja opens a Nairobi clinic", plainSearch),
  true,
);
eq("a story missing one word does not", matchesSearch("Sakaja visits Mombasa", plainSearch), false);

const filler = searchFor({ query: "Githunguri constituency news" });
eq("filler words such as county and news are left out", filler.all, [["githunguri"]]);
eq(
  "so a story naming the place answers it",
  matchesSearch("Githunguri dairy farmers meet", filler),
  true,
);

const rival = searchFor({ query: `"Charles Thiong'o" OR "Speaker Thiong'o" Githunguri OR Kiambu` });
eq("quoted phrases and OR are read as written", rival.all, [
  ["charles thiongo", "speaker thiongo"],
  ["githunguri", "kiambu"],
]);
eq(
  "either phrase and either place will do",
  matchesSearch("Speaker Thiong'o addresses Kiambu elders", rival),
  true,
);
eq(
  "a phrase alone is not enough",
  matchesSearch("Speaker Thiongo addresses a Nairobi crowd", rival),
  false,
);

const left = searchFor({ query: "Kiambu county -football" });
eq("a word with a minus is ruled out", matchesSearch("Kiambu football league final", left), false);
eq("and a story without it is kept", matchesSearch("Kiambu roads project", left), true);

const extra = searchFor({ query: "Mathira constituency news", keywords: ["Karatina", "Mathira"] });
eq(
  "a keyword's extra words need only one to be there",
  matchesSearch("Karatina market fire", extra),
  false,
);
eq("the search's own words are still needed", matchesSearch("Mathira market fire", extra), true);

const ruled = searchFor({ query: "Meru county", exclude_terms: ["sports"] });
eq("a keyword's excluded terms rule a story out", matchesSearch("Meru sports day", ruled), false);

eq(
  "a word is a whole word",
  matchesSearch("Merugi Ltd results", searchFor({ query: "Meru" })),
  false,
);
eq(
  "a search with no words matches nothing",
  matchesSearch("Anything at all", searchFor({ query: "news" })),
  false,
);

const pool = [
  { url: "u1", title: "Sakaja on water", snippet: "Nairobi governor", publishedAt: null },
  { url: "u2", title: "Mombasa port", snippet: null, publishedAt: null },
];
eq(
  "storiesFor picks the stories that answer",
  storiesFor({ query: "Sakaja water" }, pool).map((s) => s.url),
  ["u1"],
);

// ------------------------------------------------------- dates and duplicates

const NOW = Date.parse("2026-10-30T12:00:00Z");
const dated = [
  { id: "new", publishedAt: "2026-10-29T12:00:00.000Z" },
  { id: "old", publishedAt: "2026-10-10T12:00:00.000Z" },
  { id: "undated", publishedAt: null },
];
eq(
  "recent keeps the last week's and the undated",
  recent(dated, 7, NOW).map((s) => s.id),
  ["new", "undated"],
);
eq(
  "one headline under two outlets' tails reads the same",
  titleKey("Floods hit Roysambu ward!") === titleKey("floods hit roysambu ward"),
  true,
);
eq("no headline has no key", titleKey(null), "");

// ----------------------------------------------------------- Google News feed

const GN = `<rss><channel>
<item><title>Clinic opens in Kijiji ward - Kijiji Courier</title>
<link>https://news.google.com/rss/articles/CBMiExample?oc=5</link>
<pubDate>Thu, 29 Oct 2026 17:07:55 GMT</pubDate>
<description>&lt;a href="https://news.google.com/rss/articles/CBMiExample?oc=5"&gt;Clinic opens in Kijiji ward&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Kijiji Courier&lt;/font&gt;</description>
<source url="https://www.kijijicourier.test">Kijiji Courier</source></item>
<item><title>Headline with no outlet tail</title>
<link>https://news.google.com/rss/articles/CBMiOther</link><source url="not a url">Somewhere</source></item>
<item><title>No link</title></item>
</channel></rss>`;
const gn = googleNewsStories(GN);
eq("two Google News stories with links", gn.length, 2);
eq("the outlet's tail is cut from the headline", gn[0]?.title, "Clinic opens in Kijiji ward");
eq("the outlet is named", gn[0]?.outlet, "Kijiji Courier");
eq("its own site gives the domain, without www", gn[0]?.domain, "kijijicourier.test");
eq(
  "the link is Google's, kept whole",
  gn[0]?.url,
  "https://news.google.com/rss/articles/CBMiExample?oc=5",
);
eq("there is no summary to keep", gn[0]?.snippet, null);
eq("the date is an instant", gn[0]?.publishedAt, "2026-10-29T17:07:55.000Z");
eq(
  "a headline that does not end in the outlet is left alone",
  gn[1]?.title,
  "Headline with no outlet tail",
);
eq("a source address that is not one gives no domain", gn[1]?.domain, null);

// ------------------------------------------------------------ the feeds read

eq(
  "every feed is an https address",
  OUTLET_FEEDS.every((f) => f.url.startsWith("https://")),
  true,
);
eq("no feed is listed twice", new Set(OUTLET_FEEDS.map((f) => f.url)).size, OUTLET_FEEDS.length);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
