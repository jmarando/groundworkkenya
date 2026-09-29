// Checks for campaign websites: cleaning what a team types, and the page the
// public sees. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/site.test.ts

import {
  cleanContent,
  mediaUrl,
  pick,
  starterContent,
  textOn,
  type SiteContent,
} from "@/lib/site/content";
import { renderPrivacy, renderSite, type SiteView } from "@/lib/site/render";
import { blobToBase64, decodeSitePhoto, MAX_PHOTO_BYTES } from "@/lib/site/photo";

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

function ok(name: string, cond: boolean, detail = "") {
  eq(detail && !cond ? `${name} (${detail})` : name, cond, true);
}

const CAMPAIGN_ID = "ca000000-0000-4000-8000-000000000003";
const OTHER_ID = "ca000000-0000-4000-8000-000000000002";
const PHOTO = `${CAMPAIGN_ID}/0b9a3c1e-5f55-4c1e-9d6a-1f0e2b3c4d5e.jpg`;
const campaign = {
  id: CAMPAIGN_ID,
  slug: "mathira",
  name: "Waruru Gikandi",
  candidate: "Waruru Gikandi",
  seat: "MP · Mathira",
};

const bi = (en: string, sw = "") => ({ en, sw });

function site(patch: (c: SiteContent) => void = () => {}): SiteContent {
  const c = starterContent(campaign);
  c.hero.headline = bi("Mathira first", "Mathira kwanza");
  c.hero.sub = bi("A seat that works for you", "Kiti kinachokufanyia kazi");
  c.hero.photo = PHOTO;
  c.story.body = bi("Born in Karatina.\n\nA teacher for twenty years.", "Alizaliwa Karatina.");
  c.agenda.pillars = [
    { title: bi("Water", "Maji"), points: [bi("A borehole in every ward", "Kisima kila wadi")] },
  ];
  c.events.items = [
    { date: "2026-10-10", time: "14:00", place: bi("Karatina market"), what: bi("Town hall") },
    { date: "2026-01-01", time: "", place: bi("Old place"), what: bi("Long past") },
  ];
  c.updates.items = [
    { date: "2026-09-20", title: bi("We launched"), body: bi("Thank you all."), photo: null },
  ];
  c.donate.on = true;
  c.donate.paybill = "247247";
  c.donate.account = "WARURU";
  c.contact.phone = "+254712345678";
  c.contact.email = "team@example.test";
  c.contact.links.facebook = "https://www.facebook.com/waruru";
  patch(c);
  return c;
}

function view(content: SiteContent, over: Partial<SiteView> = {}): SiteView {
  return {
    campaign,
    content,
    lang: "en",
    wards: [
      { id: "w1", name: "Karatina" },
      { id: "w2", name: "Ruguru" },
    ],
    mediaBase: "https://db.example.test/storage/v1/object/public/site-media/",
    baseUrl: "https://groundwork.ke",
    renderedAt: 1_700_000_000_000,
    today: "2026-09-29",
    ...over,
  };
}

// ---------------------------------------------------------------- cleaning

{
  const good = site();
  eq("valid content survives cleaning unchanged", cleanContent(good, CAMPAIGN_ID), good);
}
{
  const c = cleanContent(
    site((s) => {
      s.colors = { primary: "red", accent: "#ABCDEF" };
    }),
    CAMPAIGN_ID,
  );
  eq(
    "a colour that is not #rrggbb falls back",
    c.colors.primary,
    starterContent(campaign).colors.primary,
  );
  eq("colours are lower case", c.colors.accent, "#abcdef");
}
{
  const c = cleanContent(
    site((s) => {
      s.contact.links.facebook = "javascript:alert(1)";
      s.contact.links.x = "http://x.com/waruru";
      s.contact.links.instagram = "https://evil.example/instagram.com";
      s.contact.links.youtube = "https://youtube.com/@waruru";
    }),
    CAMPAIGN_ID,
  );
  eq("javascript: links are dropped", c.contact.links.facebook, "");
  eq("plain http links are dropped", c.contact.links.x, "");
  eq("a link must be on the platform it claims", c.contact.links.instagram, "");
  eq("an https link on the platform stays", c.contact.links.youtube, "https://youtube.com/@waruru");
}
{
  const c = cleanContent(
    site((s) => {
      s.hero.photo = `${OTHER_ID}/0b9a3c1e-5f55-4c1e-9d6a-1f0e2b3c4d5e.jpg`;
      s.story.photo = "https://evil.example/x.jpg";
      s.seo.image = `${CAMPAIGN_ID}/../x.jpg`;
    }),
    CAMPAIGN_ID,
  );
  eq("a photo from another campaign's folder is dropped", c.hero.photo, null);
  eq("a photo from anywhere else is dropped", c.story.photo, null);
  eq("no climbing out of the folder", c.seo.image, null);
}
{
  const c = cleanContent(
    site((s) => {
      s.contact.phone = "0712 345 678";
      s.contact.whatsapp = "12345";
      s.contact.email = "not an email";
      s.donate.paybill = "24-7247";
      s.donate.till = "55 12 34";
      s.donate.account = "<b>x</b>";
    }),
    CAMPAIGN_ID,
  );
  eq("phones are stored as +254", c.contact.phone, "+254712345678");
  eq("a number that is not Kenyan mobile is dropped", c.contact.whatsapp, "");
  eq("a bad email is dropped", c.contact.email, "");
  eq("paybill keeps digits only when they make 5 to 7", c.donate.paybill, "247247");
  eq("till numbers too", c.donate.till, "551234");
  eq("an account with markup is dropped", c.donate.account, "");
}
{
  const long = "x".repeat(5000);
  const c = cleanContent(
    site((s) => {
      s.hero.headline = bi(long, long);
      s.hero.sub = bi("line one\nline two");
      s.agenda.pillars = Array.from({ length: 9 }, () => ({
        title: bi("P"),
        points: Array.from({ length: 8 }, () => bi("pt")),
      }));
      s.events.items = Array.from({ length: 20 }, () => ({
        date: "2026-13-45",
        time: "25:00",
        place: bi("x"),
        what: bi("y"),
      }));
    }),
    CAMPAIGN_ID,
  );
  eq("headlines are capped", c.hero.headline.en.length, 90);
  eq("one-line fields lose their line breaks", c.hero.sub.en, "line one line two");
  eq("at most 6 pillars", c.agenda.pillars.length, 6);
  eq("at most 5 points a pillar", c.agenda.pillars[0]?.points.length, 5);
  eq("at most 12 events", c.events.items.length, 12);
  eq("an impossible date is dropped", c.events.items[0]?.date, "");
  eq("an impossible time is dropped", c.events.items[0]?.time, "");
}
{
  const c = cleanContent(
    site((s) => {
      s.story.body = bi("a\r\n\r\n\r\n\r\nb\u0000c");
    }),
    CAMPAIGN_ID,
  );
  eq("paragraphs keep one blank line and lose control characters", c.story.body.en, "a\n\nbc");
}
eq("junk gives the empty shape", cleanContent("junk", CAMPAIGN_ID).hero.headline, bi(""));
eq("junk is not switched on or off at random", cleanContent(null, CAMPAIGN_ID).donate.on, false);
eq(
  "a template that does not exist falls back",
  cleanContent({ ...site(), template: "fancy" }, CAMPAIGN_ID).template,
  "bold",
);

// ---------------------------------------------------------------- helpers

eq("pick takes the language asked for", pick(bi("Water", "Maji"), "sw"), "Maji");
eq("and falls back to the other", pick(bi("Water", ""), "sw"), "Water");
eq("white on dark green", textOn("#14532d"), "#ffffff");
eq("black on yellow", textOn("#f5b700"), "#000000");
eq("black on white", textOn("#ffffff"), "#000000");
eq(
  "photo addresses are built from the bucket",
  mediaUrl("https://db.example.test/storage/v1/object/public/site-media", PHOTO),
  `https://db.example.test/storage/v1/object/public/site-media/${PHOTO}`,
);
eq("no photo, no address", mediaUrl("https://db.example.test/x/", null), null);

// ---------------------------------------------------------------- the page

{
  const html = renderSite(view(site()));
  ok("a whole page", html.startsWith("<!doctype html>") && html.includes("</html>"));
  ok("in English", html.includes('<html lang="en"'));
  ok("the headline", html.includes("Mathira first"));
  ok("the hero photo from storage", html.includes(`site-media/${PHOTO}`));
  ok(
    "paragraphs",
    html.includes("<p>Born in Karatina.</p>") &&
      html.includes("<p>A teacher for twenty years.</p>"),
  );
  ok("the agenda", html.includes("A borehole in every ward"));
  ok("upcoming events", html.includes("Town hall"));
  ok("past events are left out", !html.includes("Long past"));
  ok("updates", html.includes("We launched"));
  ok("the Paybill", html.includes("247247") && html.includes("WARURU"));
  ok("a link to Swahili", html.includes('href="?lang=sw"'));
  ok("the join form posts to itself", html.includes('<form method="post" action="?lang=en#join"'));
  ok("with the campaign's wards", html.includes('<option value="w1">Karatina</option>'));
  ok("and a trap for bots", html.includes('name="website"'));
  ok("and when it was shown", html.includes('name="t" value="1700000000000"'));
  ok("the privacy notice is linked", html.includes('href="/s/mathira/privacy"'));
  ok("no scripts at all", !/<script/i.test(html));
  ok("share card", html.includes('property="og:image"') && html.includes("og:title"));
  ok(
    "canonical address",
    html.includes('<link rel="canonical" href="https://groundwork.ke/s/mathira">'),
  );
  ok("phone as a link", html.includes('href="tel:+254712345678"'));
}
{
  const html = renderSite(
    view(
      site((s) => {
        s.hero.headline = bi('<script>alert("x")</script> & co');
      }),
    ),
  );
  ok(
    "what a team types is escaped",
    html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co"),
  );
  ok("and never runs", !html.includes("<script>alert"));
}
{
  const html = renderSite(
    view(
      site((s) => {
        s.story.on = false;
        s.donate.on = false;
      }),
    ),
  );
  ok(
    "a switched-off section is not there",
    !html.includes('id="story"') && !html.includes("Born in Karatina"),
  );
  ok("nor in the menu", !html.includes('href="#story"') && !html.includes('href="#donate"'));
}
{
  const html = renderSite(view(site(), { lang: "sw" }));
  ok("in Swahili", html.includes('<html lang="sw"'));
  ok("Swahili text where there is some", html.includes("Mathira kwanza") && html.includes("Maji"));
  ok("English where there is none", html.includes("Town hall"));
  ok("Swahili headings", html.includes("Ajenda") && html.includes("Jitolee"));
  ok("a link back to English", html.includes('href="?lang=en"'));
}
{
  const html = renderSite(
    view(
      site((s) => {
        s.donate.paybill = "";
        s.donate.account = "";
        s.donate.till = "551234";
      }),
    ),
  );
  ok("a Till instead of a Paybill", html.includes("Buy Goods") && html.includes("551234"));
}
{
  const html = renderSite(view(site(), { preview: true }));
  ok("the preview's form cannot be sent", html.includes("<fieldset disabled"));
  ok("and says it is a preview", html.includes("Preview"));
}
{
  const html = renderSite(
    view(site(), {
      join: {
        state: "error",
        message: bi("Use a number like 0712 345 678.", "Tumia namba kama 0712 345 678."),
        values: { name: "Wanjiku <b>", phone: "0712", ward: "w2", helps: ["calls"] },
      },
    }),
  );
  ok("the error is shown", html.includes("Use a number like 0712 345 678."));
  ok("what they typed is kept, escaped", html.includes('value="Wanjiku &lt;b&gt;"'));
  ok("their ward stays chosen", html.includes('<option value="w2" selected>Ruguru</option>'));
  ok("their offer stays ticked", html.includes('value="calls" checked'));
}
{
  const html = renderSite(view(site(), { join: { state: "done", name: "Wanjiku" } }));
  ok("thanks by name", html.includes("Asante, Wanjiku!"));
  ok("and no form", !html.includes('name="phone"'));
}
{
  const html = renderSite(view(site(), { wards: [] }));
  ok("no wards, no ward question", !html.includes('name="ward"'));
}
{
  const dark = renderSite(view(site((s) => (s.colors.primary = "#14532d"))));
  const light = renderSite(view(site((s) => (s.colors.primary = "#f5b700"))));
  ok("white text on a dark colour", dark.includes("--on-p:#ffffff"));
  ok("black text on a light one", light.includes("--on-p:#000000"));
}
for (const t of ["bold", "classic", "minimal"] as const) {
  const html = renderSite(view(site((s) => (s.template = t))));
  ok(`the ${t} template`, html.includes(`<body class="t-${t}"`));
}

// ---------------------------------------------------------------- privacy

{
  const html = renderPrivacy({
    campaign,
    content: site(),
    lang: "en",
    baseUrl: "https://groundwork.ke",
  });
  ok("names who is responsible", html.includes("Waruru Gikandi"));
  ok("says how to stop", html.includes("STOP"));
  ok("says how to reach them", html.includes("team@example.test"));
  ok("links back to the site", html.includes('href="/s/mathira"'));
  const sw = renderPrivacy({
    campaign,
    content: site(),
    lang: "sw",
    baseUrl: "https://groundwork.ke",
  });
  ok("and in Swahili", sw.includes('<html lang="sw"') && sw.includes("Faragha"));
  ok(
    "a campaign named for its candidate is not named twice",
    html.includes("The campaign of Waruru Gikandi decides"),
  );
  const sakaja = renderPrivacy({
    campaign: { ...campaign, name: "Sakaja 2027", candidate: "Johnson Sakaja" },
    content: site(),
    lang: "en",
    baseUrl: "https://groundwork.ke",
  });
  ok(
    "otherwise both names",
    sakaja.includes("Sakaja 2027, the campaign of Johnson Sakaja, decides"),
  );
}

// ---------------------------------------------------------------- photos

function photoError(b64: string): string {
  try {
    decodeSitePhoto(b64);
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
{
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
  eq("a JPEG decodes", Array.from(decodeSitePhoto(jpeg).slice(0, 3)), [0xff, 0xd8, 0xff]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]).toString("base64");
  eq("anything else is refused", photoError(png), "Send the picture as a JPEG.");
  eq("nothing at all", photoError(""), "Choose a picture.");
  eq("not base64", photoError("<script>"), "That picture could not be read.");
  const big = Buffer.alloc(MAX_PHOTO_BYTES + 1, 0xff).toString("base64");
  eq("over 2 MB", photoError(big), "That picture is too big. Choose one under 2 MB.");
}

async function photos() {
  const bytes = new Uint8Array(70000).map((_, i) => i % 256);
  const b64 = await blobToBase64(new Blob([bytes]));
  eq("large photos encode in chunks, byte for byte", b64, Buffer.from(bytes).toString("base64"));
}

await photos();

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
