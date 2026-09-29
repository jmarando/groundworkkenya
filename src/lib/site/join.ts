// Reading a volunteer sign-up from a campaign website's form. Pure, so it can
// be checked without a database; recordVolunteer does the writing.

import { normalizeKePhone } from "@/lib/phone";
import type { Bi } from "@/lib/site/content";
import { HELPS, type JoinValues } from "@/lib/site/render";

/** Faster than a person can read the form and type a name and a number. */
export const MIN_FILL_MS = 1500;
const DAY_MS = 864e5;

export const JOIN_ERRORS = {
  stale: {
    en: "This page was open a long time. Please send it again.",
    sw: "Ukurasa huu ulikaa wazi muda mrefu. Tafadhali tuma tena.",
  },
  name: { en: "Tell us your name.", sw: "Tuambie jina lako." },
  phone: {
    en: "Use a number like 0712 345 678.",
    sw: "Tumia namba kama 0712 345 678.",
  },
  busy: {
    en: "Too many sign-ups from this connection. Please wait a few minutes and try again.",
    sw: "Usajili mwingi kutoka muunganisho huu. Tafadhali subiri dakika chache ujaribu tena.",
  },
  failed: {
    en: "Something went wrong. Please try again.",
    sw: "Kuna hitilafu. Tafadhali jaribu tena.",
  },
} satisfies Record<string, Bi>;

export type ParsedJoin =
  | { kind: "bot" }
  | { kind: "error"; message: Bi; values: JoinValues }
  | { kind: "ok"; values: JoinValues };

type Fields = { get(name: string): unknown; getAll(name: string): unknown[] };

// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

/**
 * What the form says, checked. Naive bots (the trap field filled, or sent
 * faster than a person could) come back as "bot": the caller thanks them and
 * records nothing. A good sign-up comes back with the number as stored.
 */
export function parseJoin(fields: Fields, wards: { id: string }[], now: number): ParsedJoin {
  const str = (k: string) => {
    const v = fields.get(k);
    return typeof v === "string" ? v : "";
  };
  if (str("website") !== "") return { kind: "bot" };
  const shownAt = Number(str("t"));
  if (!str("t") || !Number.isFinite(shownAt) || now - shownAt < MIN_FILL_MS) return { kind: "bot" };

  const ward = str("ward");
  const helps = fields
    .getAll("helps")
    .filter((h): h is string => typeof h === "string" && HELPS.some((x) => x.key === h));
  const values: JoinValues = {
    name: str("name").replace(HIDDEN, " ").replace(/\s+/g, " ").trim().slice(0, 60),
    phone: str("phone").trim().slice(0, 20),
    ward: wards.some((w) => w.id === ward) ? ward : "",
    helps: [...new Set(helps)],
  };

  // Open since yesterday: a person, not a bot. Ask again rather than guess.
  if (now - shownAt > DAY_MS) return { kind: "error", message: JOIN_ERRORS.stale, values };
  if (values.name.length < 2) return { kind: "error", message: JOIN_ERRORS.name, values };
  const phone = normalizeKePhone(values.phone);
  if (!phone) return { kind: "error", message: JOIN_ERRORS.phone, values };
  return { kind: "ok", values: { ...values, phone } };
}
