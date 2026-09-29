// A campaign website's content: one JSON document, in English and Swahili.
//
// All of it is typed by a campaign team and shown to the public, so
// cleanContent() trusts nothing: it rebuilds the document field by field,
// caps every length, keeps links to https on the platform they name, photos
// to the campaign's own folder and colours to #rrggbb. It runs before a draft
// is saved and again before any page is drawn, so content that reached the
// database some other way is cleaned as well.

import { normalizeKePhone } from "@/lib/phone";

export type Lang = "en" | "sw";
export type Bi = { en: string; sw: string };
export type SiteTemplate = "bold" | "classic" | "minimal";
export const TEMPLATES: readonly SiteTemplate[] = ["bold", "classic", "minimal"];

export type Pillar = { title: Bi; points: Bi[] };
export type SiteEvent = { date: string; time: string; place: Bi; what: Bi };
export type SiteUpdate = { date: string; title: Bi; body: Bi; photo: string | null };
export type SocialLinks = {
  facebook: string;
  x: string;
  instagram: string;
  tiktok: string;
  youtube: string;
};
export type Social = keyof SocialLinks;

export type SiteContent = {
  v: 1;
  template: SiteTemplate;
  /** The language a visitor sees first. */
  lang: Lang;
  colors: { primary: string; accent: string };
  seo: { title: Bi; description: Bi; image: string | null };
  hero: { on: boolean; headline: Bi; sub: Bi; photo: string | null };
  story: { on: boolean; title: Bi; body: Bi; photo: string | null };
  agenda: { on: boolean; title: Bi; pillars: Pillar[] };
  events: { on: boolean; title: Bi; items: SiteEvent[] };
  updates: { on: boolean; title: Bi; items: SiteUpdate[] };
  volunteer: { on: boolean; title: Bi; pitch: Bi };
  donate: { on: boolean; title: Bi; note: Bi; paybill: string; account: string; till: string };
  contact: {
    on: boolean;
    office: Bi;
    phone: string;
    whatsapp: string;
    email: string;
    links: SocialLinks;
  };
};

export const LIMITS = {
  pillars: 6,
  points: 5,
  events: 12,
  updates: 12,
  headline: 90,
  sub: 160,
  title: 60,
  body: 4000,
  pillar: 80,
  point: 200,
  place: 120,
  what: 200,
  updateTitle: 100,
  updateBody: 1500,
  pitch: 400,
  note: 300,
  office: 160,
  seoTitle: 70,
  seoDescription: 200,
} as const;

export const DEFAULT_COLORS = { primary: "#14532d", accent: "#f5b700" };

/** The platforms a site can link to, and the addresses each may use. */
export const SOCIAL_HOSTS: Record<Social, string[]> = {
  facebook: ["facebook.com", "fb.com"],
  x: ["x.com", "twitter.com"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
};
export const SOCIALS = Object.keys(SOCIAL_HOSTS) as Social[];

const bi = (en = "", sw = en): Bi => ({ en, sw });

/** A first draft from what the campaign already told us. */
export function starterContent(c: {
  name: string;
  candidate: string | null;
  seat: string;
}): SiteContent {
  const who = c.candidate?.trim() || c.name;
  return {
    v: 1,
    template: "bold",
    lang: "en",
    colors: { ...DEFAULT_COLORS },
    seo: { title: bi(""), description: bi(""), image: null },
    hero: { on: true, headline: bi(who), sub: bi(c.seat), photo: null },
    story: { on: true, title: bi(""), body: bi(""), photo: null },
    agenda: { on: true, title: bi(""), pillars: [] },
    events: { on: true, title: bi(""), items: [] },
    updates: { on: true, title: bi(""), items: [] },
    volunteer: { on: true, title: bi(""), pitch: bi("") },
    donate: { on: false, title: bi(""), note: bi(""), paybill: "", account: "", till: "" },
    contact: {
      on: true,
      office: bi(""),
      phone: "",
      whatsapp: "",
      email: "",
      links: { facebook: "", x: "", instagram: "", tiktok: "", youtube: "" },
    },
  };
}

/* ---------------------------------------------------------------- cleaning */

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj =>
  x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : {};
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

// Control characters other than tab and newline, and the invisible
// direction overrides that can disguise text.
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

/** Multi-line text: paragraphs kept, at most one blank line between them. */
function text(x: unknown, max: number): string {
  if (typeof x !== "string") return "";
  return x
    .replace(/\r\n?/g, "\n")
    .replace(HIDDEN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

/** One line: line breaks and runs of spaces become one space. */
function line(x: unknown, max: number): string {
  if (typeof x !== "string") return "";
  return x.replace(HIDDEN, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function biText(x: unknown, max: number, multi = false): Bi {
  const o = obj(x);
  const f = multi ? text : line;
  return { en: f(o["en"], max), sw: f(o["sw"], max) };
}

const on = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback);

function colour(x: unknown, fallback: string): string {
  return typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : fallback;
}

/** Only files in this campaign's own folder: <campaign id>/<uuid>.<jpg|png|webp>. */
function photo(x: unknown, campaignId: string): string | null {
  if (typeof x !== "string" || !x.startsWith(campaignId + "/")) return null;
  const file = x.slice(campaignId.length + 1);
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(file) ? x : null;
}

function isoDate(x: unknown): string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return "";
  const d = new Date(x + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x ? x : "";
}

function clock(x: unknown): string {
  return typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x) ? x : "";
}

/** An https address with a real host and no login in it, else "". */
export function httpsUrl(x: unknown, hosts?: string[]): string {
  if (typeof x !== "string" || x.length > 300) return "";
  let u: URL;
  try {
    u = new URL(x.trim());
  } catch {
    return "";
  }
  if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return "";
  const host = u.hostname.toLowerCase();
  if (hosts && !hosts.some((h) => host === h || host.endsWith("." + h))) return "";
  return u.toString();
}

function email(x: unknown): string {
  const e = line(x, 200);
  return /^[^\s@<>"',;]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/i.test(e) ? e : "";
}

const phone = (x: unknown) => (typeof x === "string" ? (normalizeKePhone(x) ?? "") : "");

/** Paybill and till numbers: 5 to 7 digits, whatever spacing they came with. */
function shortCode(x: unknown): string {
  const d = typeof x === "string" ? x.replace(/\D/g, "") : "";
  return /^\d{5,7}$/.test(d) ? d : "";
}

function account(x: unknown): string {
  const a = line(x, 20);
  return /^[A-Za-z0-9 _-]+$/.test(a) ? a : "";
}

/** The document as it should be, rebuilt from whatever arrived. */
export function cleanContent(input: unknown, campaignId: string): SiteContent {
  const c = obj(input);
  const colors = obj(c["colors"]);
  const seo = obj(c["seo"]);
  const hero = obj(c["hero"]);
  const story = obj(c["story"]);
  const agenda = obj(c["agenda"]);
  const events = obj(c["events"]);
  const updates = obj(c["updates"]);
  const volunteer = obj(c["volunteer"]);
  const donate = obj(c["donate"]);
  const contact = obj(c["contact"]);
  const links = obj(contact["links"]);

  return {
    v: 1,
    template: TEMPLATES.includes(c["template"] as SiteTemplate)
      ? (c["template"] as SiteTemplate)
      : "bold",
    lang: c["lang"] === "sw" ? "sw" : "en",
    colors: {
      primary: colour(colors["primary"], DEFAULT_COLORS.primary),
      accent: colour(colors["accent"], DEFAULT_COLORS.accent),
    },
    seo: {
      title: biText(seo["title"], LIMITS.seoTitle),
      description: biText(seo["description"], LIMITS.seoDescription),
      image: photo(seo["image"], campaignId),
    },
    hero: {
      on: on(hero["on"], true),
      headline: biText(hero["headline"], LIMITS.headline),
      sub: biText(hero["sub"], LIMITS.sub),
      photo: photo(hero["photo"], campaignId),
    },
    story: {
      on: on(story["on"], true),
      title: biText(story["title"], LIMITS.title),
      body: biText(story["body"], LIMITS.body, true),
      photo: photo(story["photo"], campaignId),
    },
    agenda: {
      on: on(agenda["on"], true),
      title: biText(agenda["title"], LIMITS.title),
      pillars: list(agenda["pillars"])
        .slice(0, LIMITS.pillars)
        .map((p) => ({
          title: biText(obj(p)["title"], LIMITS.pillar),
          points: list(obj(p)["points"])
            .slice(0, LIMITS.points)
            .map((pt) => biText(pt, LIMITS.point)),
        })),
    },
    events: {
      on: on(events["on"], true),
      title: biText(events["title"], LIMITS.title),
      items: list(events["items"])
        .slice(0, LIMITS.events)
        .map((e) => ({
          date: isoDate(obj(e)["date"]),
          time: clock(obj(e)["time"]),
          place: biText(obj(e)["place"], LIMITS.place),
          what: biText(obj(e)["what"], LIMITS.what),
        })),
    },
    updates: {
      on: on(updates["on"], true),
      title: biText(updates["title"], LIMITS.title),
      items: list(updates["items"])
        .slice(0, LIMITS.updates)
        .map((u) => ({
          date: isoDate(obj(u)["date"]),
          title: biText(obj(u)["title"], LIMITS.updateTitle),
          body: biText(obj(u)["body"], LIMITS.updateBody, true),
          photo: photo(obj(u)["photo"], campaignId),
        })),
    },
    volunteer: {
      on: on(volunteer["on"], true),
      title: biText(volunteer["title"], LIMITS.title),
      pitch: biText(volunteer["pitch"], LIMITS.pitch, true),
    },
    donate: {
      on: on(donate["on"], false),
      title: biText(donate["title"], LIMITS.title),
      note: biText(donate["note"], LIMITS.note, true),
      paybill: shortCode(donate["paybill"]),
      account: account(donate["account"]),
      till: shortCode(donate["till"]),
    },
    contact: {
      on: on(contact["on"], true),
      office: biText(contact["office"], LIMITS.office),
      phone: phone(contact["phone"]),
      whatsapp: phone(contact["whatsapp"]),
      email: email(contact["email"]),
      links: {
        facebook: httpsUrl(links["facebook"], SOCIAL_HOSTS.facebook),
        x: httpsUrl(links["x"], SOCIAL_HOSTS.x),
        instagram: httpsUrl(links["instagram"], SOCIAL_HOSTS.instagram),
        tiktok: httpsUrl(links["tiktok"], SOCIAL_HOSTS.tiktok),
        youtube: httpsUrl(links["youtube"], SOCIAL_HOSTS.youtube),
      },
    },
  };
}

/* ---------------------------------------------------------------- helpers */

/** The text in the language asked for, else in the other one. */
export function pick(b: Bi, lang: Lang): string {
  return b[lang].trim() || b[lang === "en" ? "sw" : "en"].trim();
}

/** Black or white, whichever reads better on this colour (WCAG contrast). */
export function textOn(hex: string): "#000000" | "#ffffff" {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h ?? "0", 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? "#000000" : "#ffffff";
}

/** The public address of a photo in the bucket. */
export function mediaUrl(base: string, path: string | null): string | null {
  if (!path) return null;
  return base.replace(/\/*$/, "/") + path.split("/").map(encodeURIComponent).join("/");
}
