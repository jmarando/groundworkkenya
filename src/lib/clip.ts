// Text cut for storing, from Daraja Pulse (supabase/functions/_shared/clip.ts). Pure.

/**
 * Text cut to at most n UTF-16 units and safe to store. An emoji that would not fit whole is left
 * out rather than split, half an emoji that arrived already cut is dropped, and so is NUL. Postgres
 * refuses either one ("invalid input syntax for type json", "unsupported Unicode escape sequence"),
 * and with it the whole statement it came in. Null when nothing is left or the value isn't text.
 */
export function clip(text: unknown, n: number): string | null {
  if (typeof text !== "string") return null;
  let out = "";
  // A string iterates by code point: a whole emoji comes out as its two halves together, half of
  // one comes out alone.
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 0 || (ch.length === 1 && code >= 0xd800 && code <= 0xdfff)) continue;
    if (out.length + ch.length > n) break;
    out += ch;
  }
  return out || null;
}
