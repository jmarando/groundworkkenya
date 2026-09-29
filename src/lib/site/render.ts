// A campaign's public website, drawn as one HTML page.
//
// Like the poll page it is server-rendered, with inline CSS, system fonts and
// no JavaScript: it has to open on cheap phones over 2G, and a React bundle
// would shut out the people a campaign most needs to reach. The console's
// phone preview draws the same page with the same function, so what the team
// sees is what visitors get.
//
// Content is cleaned here as well as when it is saved, and everything typed
// by the team is escaped on the way out.

import {
  cleanContent,
  mediaUrl,
  pick,
  textOn,
  type Bi,
  type Lang,
  type SiteContent,
} from "@/lib/site/content";

export type SiteCampaign = {
  id: string;
  slug: string;
  name: string;
  candidate: string | null;
  seat: string;
};

export type JoinValues = { name: string; phone: string; ward: string; helps: string[] };

export type JoinState =
  | { state: "idle" }
  | { state: "error"; message: Bi; values: JoinValues }
  | { state: "done"; name: string };

export type SiteView = {
  campaign: SiteCampaign;
  /** As stored: cleaned again here before anything is drawn. */
  content: unknown;
  lang: Lang;
  wards: { id: string; name: string }[];
  /** Public address of the site-media bucket. */
  mediaBase: string;
  /** Where the site lives, for share cards: https://groundwork.ke */
  baseUrl: string;
  /** The console's preview: the form is shown but cannot be sent. */
  preview?: boolean;
  join?: JoinState;
  /** When the form was drawn, for the minimum fill time. */
  renderedAt?: number;
  /** Today in Nairobi, YYYY-MM-DD: events before it are over. */
  today?: string;
};

export const HELPS = [
  { key: "doors", label: { en: "Door to door", sw: "Nyumba kwa nyumba" } },
  { key: "calls", label: { en: "Phone calls", sw: "Kupiga simu" } },
  { key: "events", label: { en: "Events and rallies", sw: "Mikutano na hafla" } },
  { key: "agent", label: { en: "Polling agent on election day", sw: "Wakala siku ya uchaguzi" } },
] as const;

const WORDS = {
  en: {
    story: "Our story",
    agenda: "Agenda",
    events: "Events",
    updates: "Updates",
    volunteer: "Volunteer",
    donate: "Donate",
    contact: "Contact",
    join: "Join the team",
    give: "Donate",
    other: "Kiswahili",
    pitch:
      "Knock on doors, make calls, help at events, or keep watch at a polling station on election day.",
    name: "Your name",
    phone: "Phone number",
    ward: "Ward",
    wardPick: "Choose your ward",
    helps: "How can you help?",
    send: "Sign me up",
    fine: "We'll text you once to confirm. Reply START to agree; if you don't reply, you won't hear from us again. Reply STOP at any time.",
    privacy: "Privacy notice",
    thanks: "Asante, {name}!",
    thanksBody: "We've sent you a text. Reply START to confirm, and the team will be in touch.",
    preview: "Preview. The sign-up form is switched off here.",
    payGo: "On your phone: M-PESA, then Lipa na M-PESA, then Pay Bill.",
    tillGo: "On your phone: M-PESA, then Lipa na M-PESA, then Buy Goods and Services.",
    business: "Business number",
    account: "Account number",
    accountAny: "your name",
    tillNo: "Till number",
    amount: "Enter the amount and your M-PESA PIN, then confirm.",
    office: "Office",
    call: "Call",
    whatsapp: "WhatsApp",
    email: "Email",
    made: "Made with groundwork",
  },
  sw: {
    story: "Historia yetu",
    agenda: "Ajenda",
    events: "Matukio",
    updates: "Taarifa",
    volunteer: "Jitolee",
    donate: "Changia",
    contact: "Wasiliana nasi",
    join: "Jiunge nasi",
    give: "Changia",
    other: "English",
    pitch:
      "Bisha hodi mlangoni, piga simu, saidia kwenye mikutano, au linda kituo cha kupigia kura siku ya uchaguzi.",
    name: "Jina lako",
    phone: "Namba ya simu",
    ward: "Wadi",
    wardPick: "Chagua wadi yako",
    helps: "Unaweza kusaidia vipi?",
    send: "Nisajili",
    fine: "Tutakutumia SMS moja kuthibitisha. Jibu START kukubali; usipojibu, hutapokea ujumbe zaidi. Tuma STOP wakati wowote.",
    privacy: "Faragha",
    thanks: "Asante, {name}!",
    thanksBody: "Tumekutumia SMS. Jibu START kuthibitisha, na timu itawasiliana nawe.",
    preview: "Hakikisho. Fomu ya kujisajili haitumi kutoka hapa.",
    payGo: "Kwenye simu yako: M-PESA, kisha Lipa na M-PESA, kisha Pay Bill.",
    tillGo: "Kwenye simu yako: M-PESA, kisha Lipa na M-PESA, kisha Buy Goods and Services.",
    business: "Namba ya biashara",
    account: "Namba ya akaunti",
    accountAny: "jina lako",
    tillNo: "Namba ya till",
    amount: "Weka kiasi na PIN yako ya M-PESA, kisha thibitisha.",
    office: "Ofisi",
    call: "Piga simu",
    whatsapp: "WhatsApp",
    email: "Barua pepe",
    made: "Imetengenezwa na groundwork",
  },
} as const;

const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  sw: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"],
};

const SOCIAL_NAMES = {
  facebook: "Facebook",
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
} as const;

export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** Paragraphs split on blank lines; a single line break stays a line break. */
function paras(s: string): string {
  return s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function dayMonth(iso: string, lang: Lang): { d: string; m: string } {
  return {
    d: String(Number(iso.slice(8, 10))),
    m: MONTHS[lang][Number(iso.slice(5, 7)) - 1] ?? "",
  };
}

function longDate(iso: string, lang: Lang): string {
  const { d, m } = dayMonth(iso, lang);
  return `${d} ${m} ${iso.slice(0, 4)}`;
}

const nairobiToday = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);

/** +254712345678 → +254 712 345 678 */
function showPhone(e164: string): string {
  const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+254 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

function styles(c: SiteContent): string {
  const { primary, accent } = c.colors;
  return `:root{--p:${primary};--on-p:${textOn(primary)};--a:${accent};--on-a:${textOn(accent)};--ink:#141c19;--muted:#59625d;--line:#e2e2dc;--paper:#fff;--soft:#f5f5f0}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:inherit}
img{max-width:100%;display:block}
.w{max-width:1080px;margin:0 auto;padding:0 20px}
.ribbon{background:#141c19;color:#fff;text-align:center;font-size:13px;padding:6px 12px}
.top{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--line)}
.top .w{display:flex;align-items:center;gap:20px;min-height:60px}
.brand{font-weight:800;text-decoration:none;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav{display:flex;gap:20px;margin-left:auto;overflow-x:auto;scrollbar-width:none}
.nav a{text-decoration:none;font-size:15px;color:var(--muted);white-space:nowrap;padding:8px 0}
.nav a:hover{color:var(--ink)}
.lang{margin-left:auto;font-size:14px;font-weight:600;border:1px solid var(--line);border-radius:999px;padding:5px 12px;text-decoration:none;white-space:nowrap}
.nav+.lang{margin-left:0}
@media (max-width:760px){.top .w{flex-wrap:wrap;gap:4px 16px;padding-top:8px}.nav{order:3;width:100%;margin:0;gap:18px}.nav a{padding:6px 0 10px}}
.hero{padding:64px 0}
.hero .w{display:grid;gap:36px;align-items:center}
@media (min-width:820px){.hero.ph .w{grid-template-columns:1.1fr .9fr}}
.hero h1{font-size:clamp(36px,7vw,68px);line-height:1.04;letter-spacing:-.025em;margin:0 0 18px}
.hero .sub{font-size:clamp(18px,2.4vw,23px);margin:0 0 30px;opacity:.92;max-width:34em}
.hero img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:20px}
@media (max-width:819px){.hero img{aspect-ratio:4/3}}
.btns{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 26px;border-radius:999px;font-weight:700;text-decoration:none;border:2px solid transparent}
.s{padding:64px 0;border-top:1px solid var(--line)}
h2{font-size:clamp(28px,4vw,40px);line-height:1.12;margin:0 0 24px;letter-spacing:-.015em}
h3{line-height:1.25}
.lead{font-size:19px;max-width:40em}
.lead p:first-child{margin-top:0}
.two{display:grid;gap:36px}
@media (min-width:820px){.two.ph{grid-template-columns:1fr 1fr;align-items:start}}
.two img{border-radius:16px;aspect-ratio:4/3;object-fit:cover;width:100%}
.pillars{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{border:1px solid var(--line);border-radius:16px;background:var(--paper)}
.pillar{padding:22px}
.pillar .n{font-size:13px;font-weight:800;color:var(--p);letter-spacing:.1em}
.pillar h3{margin:4px 0 10px;font-size:21px}
.pillar ul{margin:0;padding-left:20px}
.pillar li{margin:6px 0}
.events{list-style:none;margin:0;padding:0;display:grid;gap:12px;max-width:760px}
.ev{display:flex;gap:18px;align-items:flex-start;padding:16px}
.ev .d{flex:none;width:66px;text-align:center;border-radius:12px;background:var(--p);color:var(--on-p);padding:8px 0;line-height:1.1}
.ev .d b{display:block;font-size:26px}
.ev .d span{font-size:12px;text-transform:uppercase;letter-spacing:.1em}
.ev h3{margin:2px 0 4px;font-size:19px}
.ev p{margin:0;color:var(--muted)}
.updates{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.up{overflow:hidden}
.up img{aspect-ratio:16/9;object-fit:cover;width:100%}
.up .in{padding:18px 20px}
.up time{font-size:14px;color:var(--muted)}
.up h3{margin:4px 0 8px;font-size:20px}
.up p{margin:0 0 10px}
form{max-width:560px}
fieldset{border:0;padding:0;margin:0;min-width:0}
label{display:block;font-weight:600;margin:16px 0 6px}
input[type=text],input[type=tel],select{width:100%;font:inherit;border:2px solid var(--ink);border-radius:12px;padding:12px 14px;background:#fff;color:var(--ink)}
.checks{display:grid;gap:8px}
.checks label{display:flex;gap:10px;align-items:center;font-weight:500;margin:0;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--paper)}
.checks input{width:20px;height:20px;accent-color:var(--p);flex:none}
legend{font-weight:600;margin:16px 0 6px;padding:0}
button{margin-top:20px;min-height:54px;width:100%;border:0;border-radius:999px;background:var(--p);color:var(--on-p);font:inherit;font-weight:800;cursor:pointer}
fieldset[disabled] button{opacity:.55;cursor:not-allowed}
.fine{font-size:14px;color:var(--muted);margin-top:14px}
.err{background:#fdece7;color:#9c2f0f;border-radius:12px;padding:12px 14px;margin:0 0 8px}
.done{background:var(--soft);border-left:6px solid var(--p);border-radius:12px;padding:20px 22px;max-width:560px}
.done h3{margin:0 0 6px;font-size:22px}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.give{display:grid;gap:24px;align-items:start}
@media (min-width:820px){.give{grid-template-columns:1fr 1fr}}
.steps{margin:0;padding:22px 22px 22px 44px}
.steps li{margin:8px 0}
.code{font:700 22px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.05em;background:var(--soft);border-radius:8px;padding:1px 8px;display:inline-block}
.contact{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.contact .card{padding:16px 18px}
.contact small{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em}
.contact a{font-weight:600}
.social{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.social a{border:1px solid var(--line);border-radius:999px;padding:6px 16px;text-decoration:none;font-weight:600;font-size:15px}
footer{padding:28px 0 48px;color:var(--muted);font-size:14px;border-top:1px solid var(--line)}
footer .w{display:flex;flex-wrap:wrap;gap:6px 20px}
:focus-visible{outline:3px solid var(--a);outline-offset:2px}
.t-bold .hero{background:var(--p);color:var(--on-p)}
.t-bold .hero h1{font-weight:850}
.t-bold h2{font-weight:850}
.t-bold h2::after{content:"";display:block;width:56px;height:6px;background:var(--a);margin-top:14px;border-radius:3px}
.t-bold .b1{background:var(--a);color:var(--on-a)}
.t-bold .b2{border-color:currentColor}
.t-bold .s.alt{background:var(--soft)}
.t-classic .top{border-top:6px solid var(--p)}
.t-classic h1,.t-classic h2,.t-classic h3{font-family:Georgia,"Times New Roman",serif;font-weight:700}
.t-classic .hero{background:var(--soft);text-align:center}
.t-classic .hero .w{max-width:780px;grid-template-columns:1fr}
.t-classic .hero img{order:-1;aspect-ratio:16/9;border-radius:6px}
.t-classic .hero .sub{margin-left:auto;margin-right:auto}
.t-classic .btns{justify-content:center}
.t-classic .b1{background:var(--p);color:var(--on-p)}
.t-classic .b2{border-color:var(--p);color:var(--p)}
.t-classic h2{text-align:center}
.t-classic h2::after{content:"";display:block;width:40px;height:3px;background:var(--p);margin:14px auto 0}
.t-minimal .hero{padding:80px 0 48px}
.t-minimal .hero h1{font-weight:700;text-decoration:underline;text-decoration-color:var(--a);text-decoration-thickness:.1em;text-underline-offset:.14em;text-decoration-skip-ink:none}
.t-minimal .hero.ph .w{grid-template-columns:1fr}
.t-minimal .hero img{width:148px;height:148px;aspect-ratio:1;border-radius:50%;order:-1}
.t-minimal .b1{background:var(--ink);color:#fff}
.t-minimal .b2{border-color:var(--ink)}
.t-minimal .s{border-top:0;padding:48px 0}
.t-minimal h2{font-size:clamp(24px,3.2vw,30px);font-weight:700}
.t-minimal .card{border-color:transparent;background:var(--soft)}
.t-minimal .ev .d{background:var(--ink);color:#fff}`;
}

type Section = { id: string; label: string; html: string };

function sectionTitle(title: Bi, lang: Lang, fallback: string): string {
  return pick(title, lang) || fallback;
}

/** The whole page. */
export function renderSite(v: SiteView): string {
  const c = cleanContent(v.content, v.campaign.id);
  const lang = v.lang;
  const t = WORDS[lang];
  const who = v.campaign.candidate?.trim() || v.campaign.name;
  const today = v.today ?? nairobiToday();
  const photo = (p: string | null) => mediaUrl(v.mediaBase, p);
  const site = `/s/${v.campaign.slug}`;

  const sections: Section[] = [];
  let alt = false;
  const section = (id: string, label: string, inner: string) => {
    alt = !alt;
    sections.push({
      id,
      label,
      html: `<section class="s${alt ? "" : " alt"}" id="${id}"><div class="w">${inner}</div></section>`,
    });
  };

  // Our story
  const storyBody = pick(c.story.body, lang);
  if (c.story.on && (storyBody || c.story.photo)) {
    const title = sectionTitle(c.story.title, lang, t.story);
    const img = photo(c.story.photo);
    section(
      "story",
      title,
      `<h2>${esc(title)}</h2><div class="two${img ? " ph" : ""}"><div class="lead">${paras(storyBody)}</div>${
        img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : ""
      }</div>`,
    );
  }

  // Agenda
  const pillars = c.agenda.pillars.filter(
    (p) => pick(p.title, lang) || p.points.some((pt) => pick(pt, lang)),
  );
  if (c.agenda.on && pillars.length) {
    const title = sectionTitle(c.agenda.title, lang, t.agenda);
    section(
      "agenda",
      title,
      `<h2>${esc(title)}</h2><div class="pillars">${pillars
        .map((p, i) => {
          const points = p.points.map((pt) => pick(pt, lang)).filter(Boolean);
          return `<article class="card pillar"><div class="n">${String(i + 1).padStart(2, "0")}</div><h3>${esc(
            pick(p.title, lang),
          )}</h3>${points.length ? `<ul>${points.map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul>` : ""}</article>`;
        })
        .join("")}</div>`,
    );
  }

  // Events still to come, soonest first; undated ones last.
  const events = c.events.items
    .filter((e) => (pick(e.what, lang) || pick(e.place, lang)) && (!e.date || e.date >= today))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  if (c.events.on && events.length) {
    const title = sectionTitle(c.events.title, lang, t.events);
    section(
      "events",
      title,
      `<h2>${esc(title)}</h2><ul class="events">${events
        .map((e) => {
          const dm = e.date ? dayMonth(e.date, lang) : null;
          const where = [pick(e.place, lang), e.time].filter(Boolean).join(" · ");
          return `<li class="card ev">${
            dm ? `<div class="d"><b>${dm.d}</b><span>${dm.m}</span></div>` : ""
          }<div><h3>${esc(pick(e.what, lang) || pick(e.place, lang))}</h3>${
            where ? `<p>${esc(where)}</p>` : ""
          }</div></li>`;
        })
        .join("")}</ul>`,
    );
  }

  // Updates, newest first.
  const updates = c.updates.items
    .filter((u) => pick(u.title, lang) || pick(u.body, lang))
    .sort((a, b) => (b.date || "0000").localeCompare(a.date || "0000"));
  if (c.updates.on && updates.length) {
    const title = sectionTitle(c.updates.title, lang, t.updates);
    section(
      "updates",
      title,
      `<h2>${esc(title)}</h2><div class="updates">${updates
        .map((u) => {
          const img = photo(u.photo);
          return `<article class="card up">${
            img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : ""
          }<div class="in">${u.date ? `<time datetime="${u.date}">${longDate(u.date, lang)}</time>` : ""}${
            pick(u.title, lang) ? `<h3>${esc(pick(u.title, lang))}</h3>` : ""
          }${paras(pick(u.body, lang))}</div></article>`;
        })
        .join("")}</div>`,
    );
  }

  // Volunteer sign-up
  if (c.volunteer.on) {
    const title = sectionTitle(c.volunteer.title, lang, t.volunteer);
    section("join", title, `<h2>${esc(title)}</h2>${joinBlock(v, c, lang)}`);
  }

  // Donate
  const canGive = Boolean(c.donate.paybill || c.donate.till);
  if (c.donate.on && canGive) {
    const title = sectionTitle(c.donate.title, lang, t.donate);
    section("donate", title, `<h2>${esc(title)}</h2>${donateBlock(c, lang)}`);
  }

  // Contact
  const office = pick(c.contact.office, lang);
  const links = (Object.keys(SOCIAL_NAMES) as (keyof typeof SOCIAL_NAMES)[]).filter(
    (k) => c.contact.links[k],
  );
  if (
    c.contact.on &&
    (office || c.contact.phone || c.contact.whatsapp || c.contact.email || links.length)
  ) {
    const title = t.contact;
    const cards = [
      office ? `<div class="card"><small>${t.office}</small>${esc(office)}</div>` : "",
      c.contact.phone
        ? `<div class="card"><small>${t.call}</small><a href="tel:${c.contact.phone}">${showPhone(c.contact.phone)}</a></div>`
        : "",
      c.contact.whatsapp
        ? `<div class="card"><small>${t.whatsapp}</small><a href="https://wa.me/${c.contact.whatsapp.slice(1)}">${showPhone(c.contact.whatsapp)}</a></div>`
        : "",
      c.contact.email
        ? `<div class="card"><small>${t.email}</small><a href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a></div>`
        : "",
    ].join("");
    section(
      "contact",
      title,
      `<h2>${esc(title)}</h2>${cards ? `<div class="contact">${cards}</div>` : ""}${
        links.length
          ? `<div class="social">${links
              .map(
                (k) =>
                  `<a href="${esc(c.contact.links[k])}" rel="me noopener">${SOCIAL_NAMES[k]}</a>`,
              )
              .join("")}</div>`
          : ""
      }`,
    );
  }

  // The first screen
  const headline = pick(c.hero.headline, lang) || who;
  const sub = pick(c.hero.sub, lang);
  const heroImg = photo(c.hero.photo);
  const buttons = [
    c.volunteer.on ? `<a class="btn b1" href="#join">${t.join}</a>` : "",
    c.donate.on && canGive ? `<a class="btn b2" href="#donate">${t.give}</a>` : "",
  ].join("");
  const hero = c.hero.on
    ? `<section class="hero${heroImg ? " ph" : ""}"><div class="w"><div><h1>${esc(headline)}</h1>${
        sub ? `<p class="sub">${esc(sub)}</p>` : ""
      }${buttons ? `<div class="btns">${buttons}</div>` : ""}</div>${
        heroImg
          ? `<img src="${esc(heroImg)}" alt="${esc(who)}" fetchpriority="high" decoding="async">`
          : ""
      }</div></section>`
    : "";

  const other: Lang = lang === "en" ? "sw" : "en";
  // The preview switches language from the editor; a link would leave the frame.
  const langLink = v.preview
    ? `<span class="lang">${t.other}</span>`
    : `<a class="lang" href="?lang=${other}" hreflang="${other}" lang="${other}">${t.other}</a>`;
  const nav = sections.length
    ? `<nav class="nav" aria-label="${esc(who)}">${sections
        .map((s) => `<a href="#${s.id}">${esc(s.label)}</a>`)
        .join("")}</nav>`
    : "";

  const url = (l: Lang) => `${v.baseUrl}${site}${l === c.lang ? "" : `?lang=${l}`}`;
  const title = pick(c.seo.title, lang) || `${who} · ${v.campaign.seat}`;
  const description = (pick(c.seo.description, lang) || sub || storyBody)
    .replace(/\s+/g, " ")
    .slice(0, 200);
  const shareImg = photo(c.seo.image ?? c.hero.photo ?? c.story.photo);
  const year = today.slice(0, 4);
  const privacy = `${site}/privacy${lang === "en" ? "" : "?lang=sw"}`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
<link rel="canonical" href="${esc(url(lang))}">
<link rel="alternate" hreflang="en" href="${esc(url("en"))}">
<link rel="alternate" hreflang="sw" href="${esc(url("sw"))}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ""}
<meta property="og:url" content="${esc(url(lang))}">
${shareImg ? `<meta property="og:image" content="${esc(shareImg)}">` : ""}
<meta name="twitter:card" content="${shareImg ? "summary_large_image" : "summary"}">
<meta name="theme-color" content="${c.colors.primary}">
<style>${styles(c)}</style>
</head>
<body class="t-${c.template}">
${v.preview ? `<div class="ribbon">${t.preview}</div>` : ""}
<header class="top"><div class="w"><a class="brand" href="#top">${esc(who)}</a>${nav}${langLink}</div></header>
<main id="top">
${hero}
${sections.map((s) => s.html).join("\n")}
</main>
<footer><div class="w"><span>© ${year} ${esc(v.campaign.name)}</span><a href="${privacy}">${t.privacy}</a><span>${t.made}</span></div></footer>
</body>
</html>`;
}

function joinBlock(v: SiteView, c: SiteContent, lang: Lang): string {
  const t = WORDS[lang];
  const pitch = pick(c.volunteer.pitch, lang) || t.pitch;
  const join = v.join ?? { state: "idle" };
  if (join.state === "done") {
    return `<div class="done" role="status"><h3>${esc(t.thanks.replace("{name}", join.name))}</h3><p>${t.thanksBody}</p></div>`;
  }
  const values: JoinValues =
    join.state === "error" ? join.values : { name: "", phone: "", ward: "", helps: [] };
  const wards = v.wards.length
    ? `<label for="j-ward">${t.ward}</label><select id="j-ward" name="ward"><option value="">${t.wardPick}</option>${v.wards
        .map(
          (w) =>
            `<option value="${esc(w.id)}"${values.ward === w.id ? " selected" : ""}>${esc(w.name)}</option>`,
        )
        .join("")}</select>`
    : "";
  const helps = `<fieldset><legend>${t.helps}</legend><div class="checks">${HELPS.map(
    (h) =>
      `<label><input type="checkbox" name="helps" value="${h.key}"${
        values.helps.includes(h.key) ? " checked" : ""
      }> ${h.label[lang]}</label>`,
  ).join("")}</div></fieldset>`;
  return `<div class="lead">${paras(pitch)}</div>
<form method="post" action="?lang=${lang}#join">
<fieldset${v.preview ? " disabled" : ""}>
${join.state === "error" ? `<p class="err" role="alert">${esc(pick(join.message, lang))}</p>` : ""}
<label for="j-name">${t.name}</label><input id="j-name" type="text" name="name" required maxlength="60" autocomplete="name" value="${esc(values.name)}">
<label for="j-phone">${t.phone}</label><input id="j-phone" type="tel" name="phone" required maxlength="20" autocomplete="tel" inputmode="tel" placeholder="07XX XXX XXX" value="${esc(values.phone)}">
${wards}
${helps}
<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<input type="hidden" name="t" value="${v.renderedAt ?? Date.now()}">
<button type="submit">${t.send}</button>
</fieldset>
</form>
<p class="fine">${t.fine} <a href="/s/${v.campaign.slug}/privacy${lang === "en" ? "" : "?lang=sw"}">${t.privacy}</a></p>`;
}

function donateBlock(c: SiteContent, lang: Lang): string {
  const t = WORDS[lang];
  const note = pick(c.donate.note, lang);
  const steps = c.donate.paybill
    ? [
        esc(t.payGo),
        `${t.business}: <span class="code">${c.donate.paybill}</span>`,
        `${t.account}: ${c.donate.account ? `<span class="code">${esc(c.donate.account)}</span>` : t.accountAny}`,
        esc(t.amount),
      ]
    : [esc(t.tillGo), `${t.tillNo}: <span class="code">${c.donate.till}</span>`, esc(t.amount)];
  const tillToo =
    c.donate.paybill && c.donate.till
      ? `<p>${esc(t.tillGo)} ${t.tillNo}: <span class="code">${c.donate.till}</span></p>`
      : "";
  return `<div class="give"><div class="lead">${note ? paras(note) : ""}${tillToo}</div><ol class="card steps">${steps
    .map((s) => `<li>${s}</li>`)
    .join("")}</ol></div>`;
}

/* ---------------------------------------------------------------- privacy */

const PRIVACY = {
  en: {
    title: "Privacy notice",
    intro:
      "This website belongs to the campaign of {who} ({seat}). This notice explains what happens to the details you give us here.",
    sections: [
      [
        "Who is responsible",
        "{name}, the campaign of {who}, decides how your details are used. Groundwork (groundwork.ke) runs this website and the campaign's records for the campaign, and uses your details only as the campaign instructs.",
      ],
      [
        "What we collect",
        "When you sign up to volunteer: your name, phone number, ward if you choose one, and how you can help. We also keep the text messages you send us, and when you replied START or STOP. This website sets no cookies and has no trackers.",
      ],
      [
        "Why",
        "To organise volunteers, and to send you campaign news by SMS, but only after you reply START to confirm. Anyone can type a number into a form, so nothing more is sent until the phone's owner agrees.",
      ],
      [
        "Who sees your details",
        "The campaign's team. Groundwork keeps each campaign's records apart, so no other campaign can see them.",
      ],
      [
        "How long we keep them",
        "For as long as the campaign runs, or until you ask for them to be deleted.",
      ],
      [
        "Your rights",
        "Under Kenya's Data Protection Act, 2019 you can ask to see, correct or delete your details, and object to how they are used. Reply STOP to any of our messages to stop them all. For anything else, contact the campaign{contact}. You can also complain to the Office of the Data Protection Commissioner (odpc.go.ke).",
      ],
    ],
    back: "Back to the website",
    via: ": ",
    office: " through its office",
  },
  sw: {
    title: "Faragha",
    intro:
      "Tovuti hii ni ya kampeni ya {who} ({seat}). Taarifa hii inaeleza kinachofanyika kwa maelezo unayotupa hapa.",
    sections: [
      [
        "Anayehusika",
        "{name}, kampeni ya {who}, huamua jinsi maelezo yako yanavyotumika. Groundwork (groundwork.ke) huendesha tovuti hii na kumbukumbu za kampeni kwa niaba yake, na hutumia maelezo yako tu kama kampeni inavyoelekeza.",
      ],
      [
        "Tunachokusanya",
        "Unapojiandikisha kujitolea: jina lako, namba ya simu, wadi ukichagua, na jinsi unavyoweza kusaidia. Pia tunahifadhi SMS unazotutumia, na wakati ulipojibu START au STOP. Tovuti hii haiweki cookies na haina vifuatiliaji.",
      ],
      [
        "Kwa nini",
        "Kupanga wanaojitolea, na kukutumia habari za kampeni kwa SMS, lakini tu baada ya kujibu START kuthibitisha. Mtu yeyote anaweza kuandika namba kwenye fomu, kwa hivyo hakuna kingine kinachotumwa hadi mwenye simu akubali.",
      ],
      [
        "Anayeona maelezo yako",
        "Timu ya kampeni. Groundwork huweka kumbukumbu za kila kampeni kando, kwa hivyo hakuna kampeni nyingine inayoweza kuziona.",
      ],
      [
        "Tunayahifadhi kwa muda gani",
        "Kwa muda wote kampeni inaendelea, au hadi utakapoomba yafutwe.",
      ],
      [
        "Haki zako",
        "Chini ya Sheria ya Ulinzi wa Data ya Kenya, 2019 unaweza kuomba kuona, kusahihisha au kufuta maelezo yako, na kupinga jinsi yanavyotumika. Jibu STOP kwa ujumbe wetu wowote kusimamisha yote. Kwa jambo lingine, wasiliana na kampeni{contact}. Unaweza pia kulalamika kwa Ofisi ya Kamishna wa Ulinzi wa Data (odpc.go.ke).",
      ],
    ],
    back: "Rudi kwenye tovuti",
    via: ": ",
    office: " kupitia ofisi yake",
  },
} as const;

export function renderPrivacy(v: {
  campaign: SiteCampaign;
  content: unknown;
  lang: Lang;
  baseUrl: string;
}): string {
  const c = cleanContent(v.content, v.campaign.id);
  const p = PRIVACY[v.lang];
  const who = v.campaign.candidate?.trim() || v.campaign.name;
  const reach = [c.contact.email, c.contact.phone ? showPhone(c.contact.phone) : ""].filter(
    Boolean,
  );
  const contact = reach.length ? p.via + reach.join(", ") : p.office;
  const fill = (s: string) =>
    esc(
      s
        .replace(/\{who\}/g, who)
        .replace(/\{seat\}/g, v.campaign.seat)
        .replace(/\{name\}/g, v.campaign.name)
        .replace(/\{contact\}/g, contact),
    );
  const site = `/s/${v.campaign.slug}${v.lang === c.lang ? "" : `?lang=${v.lang}`}`;
  return `<!doctype html>
<html lang="${v.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)} · ${esc(who)}</title>
<link rel="canonical" href="${esc(`${v.baseUrl}/s/${v.campaign.slug}/privacy${v.lang === "en" ? "" : "?lang=sw"}`)}">
<style>${styles(c)}
main{padding:48px 0 64px}main .w{max-width:760px}h1{font-size:clamp(30px,5vw,44px);line-height:1.1;margin:0 0 16px}h2{font-size:21px;margin:32px 0 8px}h2::after{display:none!important}.t-classic h2{text-align:left}</style>
</head>
<body class="t-${c.template}">
<header class="top"><div class="w"><a class="brand" href="${site}">${esc(who)}</a></div></header>
<main><div class="w">
<h1>${esc(p.title)}</h1>
<p class="lead">${fill(p.intro)}</p>
${p.sections.map(([h, body]) => `<h2>${esc(h)}</h2><p>${fill(body)}</p>`).join("\n")}
<p><a href="${site}">${esc(p.back)}</a></p>
</div></main>
</body>
</html>`;
}
