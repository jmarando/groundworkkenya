// Helpers shared by the Website editor's components.

import type { Lang } from "@/lib/site/content";

export const LANG_NAME: Record<Lang, string> = { en: "English", sw: "Kiswahili" };

/** Where the site-media bucket's files are served from, in the browser. */
export function siteMediaBase(): string {
  const base = String(import.meta.env["VITE_SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/site-media/`;
}

/** The list with one item moved; unchanged if the move goes past either end. */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}
