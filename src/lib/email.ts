// An email address as people type it, checked for its shape. Pure.

/** An email address as people type it, lower-cased, or null when it can't be one. */
export function emailAddress(raw: unknown): string | null {
  const e = String(raw ?? "")
    .trim()
    .toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/.test(e) ? e : null;
}
