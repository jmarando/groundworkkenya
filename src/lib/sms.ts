// How many SMS a message costs.
//
// Networks bill per part, and the part size depends on the alphabet. Plain
// text in the GSM-7 alphabet fits 160 characters, or 153 per part once split.
// One character outside it — a curly apostrophe pasted from a document, an em
// dash, an emoji — turns the whole message into UCS-2: 70 characters, or 67
// per part. Across a constituency that can double the bill for a single ’.

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** These fit GSM-7 but take two characters' room each. */
const GSM7_EXTENDED = "^{}\\[]~|€\f";

const BASIC = new Set(GSM7_BASIC);
const EXTENDED = new Set(GSM7_EXTENDED);

export type SmsCount = {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the network counts them. */
  length: number;
  parts: number;
  /** Characters that forced UCS-2, if any. */
  offenders: string[];
};

export function smsParts(text: string): SmsCount {
  const chars = [...text];
  const offenders = [...new Set(chars.filter((c) => !BASIC.has(c) && !EXTENDED.has(c)))];

  if (offenders.length === 0) {
    const length = chars.reduce((n, c) => n + (EXTENDED.has(c) ? 2 : 1), 0);
    return {
      encoding: "GSM-7",
      length,
      parts: length <= 160 ? 1 : Math.ceil(length / 153),
      offenders,
    };
  }

  // UCS-2 counts UTF-16 code units: most emoji take two.
  const length = text.length;
  return { encoding: "UCS-2", length, parts: length <= 70 ? 1 : Math.ceil(length / 67), offenders };
}

/** The usual culprits, swapped for plain equivalents that fit GSM-7. */
const PLAIN: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
  "•": "-",
};

export function plainify(text: string): string {
  return [...text].map((c) => PLAIN[c] ?? c).join("");
}
