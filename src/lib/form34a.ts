// Form 34A on a feature phone: the USSD screens an agent steps through, and
// reading which stream a WhatsApp photo is for. Pure functions, no database.
//
// USSD sends the whole path typed so far ("2*120*80*30*5*1") with every
// request, so each screen is worked out afresh from the inputs. Screens are
// plain ASCII: anything outside the GSM alphabet makes the network switch to
// a mode that halves the space, and a 182-character screen is tight already.

export const USSD_MAX = 182;

export type Form34aStation = {
  code: string;
  name: string;
  streams: number;
  registered: number;
};

export type Form34aCandidate = { name: string; party: string | null };

export type Form34aStep =
  | { kind: "con"; text: string }
  | { kind: "end"; text: string }
  | { kind: "file"; stream: number; votes: number[]; rejected: number };

/** Letters without accents, straight quotes, and nothing outside plain ASCII. */
export function ascii(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, "")
    .trim();
}

const clip = (s: string, n = 10) => ascii(s).slice(0, n);

/** A count as typed on the keypad: digits only, at most five. */
function count(raw: string): number | null {
  const t = raw.trim();
  return /^\d{1,5}$/.test(t) ? Number(t) : null;
}

const con = (text: string): Form34aStep => ({ kind: "con", text });
const end = (text: string): Form34aStep => ({ kind: "end", text });

function label(c: Form34aCandidate): string {
  const name = clip(c.name, 30).toUpperCase();
  return c.party ? `${name} (${clip(c.party, 12)})` : name;
}

/** Every count on one screen, shortened as far as it takes to fit. */
export function reviewScreen(
  tag: string,
  ballot: Form34aCandidate[],
  votes: number[],
  rejected: number,
): string {
  const valid = votes.reduce((a, b) => a + b, 0);
  const head = `Thibitisha ${tag}:`;
  const foot = `Kataliwa ${rejected}, jumla ${valid + rejected}\n1. Tuma\n2. Futa`;
  const room = USSD_MAX - "CON ".length - head.length - foot.length - 2;
  const lines = [
    ballot.map((c, k) => `${clip(c.name, 14).toUpperCase()} ${votes[k]}`).join("\n"),
    ballot.map((c, k) => `${clip(c.name, 6).toUpperCase()} ${votes[k]}`).join(", "),
    `${ballot.length} wagombea, halali ${valid}`,
  ];
  const body = lines.find((l) => l.length <= room) ?? lines[lines.length - 1]!;
  return `${head}\n${body}\n${foot}`;
}

/**
 * The next screen for an agent filing one stream, from what they have typed
 * after choosing the station. Ends the session on anything unreadable: the
 * path cannot be edited, so dialling again is the way to fix a typo.
 */
export function form34aStep(
  station: Form34aStation,
  ballot: Form34aCandidate[],
  inputs: string[],
): Form34aStep {
  if (!ballot.length) return end("Orodha ya wagombea haijawekwa. Mjulishe mratibu.");

  const streams = Math.max(1, station.streams);
  let stream = 1;
  let i = 0;
  if (streams > 1) {
    const raw = inputs[0];
    if (raw === undefined) {
      return con(`${station.code} ${clip(station.name, 40)}\nMkondo (stream) upi? 1-${streams}`);
    }
    const n = count(raw);
    if (n === null || n < 1 || n > streams) {
      return end(`Mkondo "${clip(raw)}" haupo. Kituo kina mikondo 1-${streams}. Piga tena.`);
    }
    stream = n;
    i = 1;
  }

  const tag = `${station.code}/${stream}`;
  const votes: number[] = [];
  for (let k = 0; k < ballot.length; k++) {
    const raw = inputs[i + k];
    if (raw === undefined) {
      return con(`${tag} Fomu 34A (${k + 1}/${ballot.length})\nKura za ${label(ballot[k]!)}?`);
    }
    const n = count(raw);
    if (n === null) return end(`"${clip(raw)}" si namba ya kura. Piga tena uanze upya.`);
    votes.push(n);
  }
  i += ballot.length;

  const rawRejected = inputs[i];
  if (rawRejected === undefined) return con(`${tag}\nKura zilizokataliwa (rejected)?`);
  const rejected = count(rawRejected);
  if (rejected === null) return end(`"${clip(rawRejected)}" si namba. Piga tena uanze upya.`);

  const total = votes.reduce((a, b) => a + b, 0) + rejected;
  if (station.registered > 0 && total > station.registered) {
    return end(
      `Jumla ${total} ni zaidi ya waliosajiliwa ${station.registered}. Hakiki fomu, piga tena.`,
    );
  }

  const choice = inputs[i + 1]?.trim();
  if (choice === undefined) return con(reviewScreen(tag, ballot, votes, rejected));
  if (choice === "1") return { kind: "file", stream, votes, rejected };
  if (choice === "2") return end("Haijatumwa. Piga tena kuanza upya.");
  return end("Chaguo si sahihi. Haijatumwa. Piga tena.");
}

/**
 * Which station and stream a photo's caption names: "34A PS-0001/2",
 * "PS-0001 / 2", "mkondo 2", "stream 2", "/2". Either may be missing.
 */
export function parseFormCaption(caption: string | null | undefined): {
  code: string | null;
  stream: number | null;
} {
  const t = (caption ?? "").toUpperCase();
  const both = /\b([A-Z]{1,6}-?\d{1,8})\s*\/\s*(\d{1,2})\b/.exec(t);
  if (both) return { code: both[1]!, stream: Number(both[2]) };
  const code = /\b([A-Z]{1,6}-\d{1,8})\b/.exec(t)?.[1] ?? null;
  const stream = /(?:\bMKONDO|\bSTREAM|\/)\s*(\d{1,2})\b/.exec(t)?.[1];
  return { code, stream: stream ? Number(stream) : null };
}
