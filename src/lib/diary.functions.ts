// The diary, read and changed as the signed-in person. Row level security keeps
// each campaign to its own diary and lets only the candidate or campaign
// manager change it; a change that reaches no row is treated as refused.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { nairobiToday } from "@/lib/demo/insights";
import {
  byTime,
  cleanEntry,
  entryFromRow,
  weekOf,
  type CleanEntry,
  type DiaryEntry,
  type DiaryInput,
  type DiaryRow,
} from "@/lib/diary";

type Sb = SupabaseClient<Database>;

export const DIARY_DENIED = "Only the candidate or campaign manager can change the diary.";

const COLS = "id, day, starts_at, title, kind, ward_id, note, wards(name)";

/** Entries from `from` to `to`, both YYYY-MM-DD and included, by day then time. */
export async function loadDiary(sb: Sb, from: string, to: string): Promise<DiaryEntry[]> {
  const { data, error } = await sb
    .from("diary_entries")
    .select(COLS)
    .gte("day", from)
    .lte("day", to);
  if (error) throw new Error("Could not read the diary.");
  return ((data ?? []) as unknown as DiaryRow[])
    .map(entryFromRow)
    .sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b));
}

/** What to tell the person when the database says no. */
export function diaryError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return DIARY_DENIED;
  if (e.code === "23503") return "That ward isn't one of the campaign's.";
  if (e.code === "23514") return "The database refused that: check the time, title and note.";
  return "Could not save that. Try again.";
}

export async function writeEntry(sb: Sb, e: CleanEntry): Promise<string> {
  const row = {
    day: e.day,
    starts_at: e.startsAt,
    title: e.title,
    kind: e.kind,
    ward_id: e.wardId,
    note: e.note,
  };
  const { data, error } = e.id
    ? await sb.from("diary_entries").update(row).eq("id", e.id).select("id")
    : await sb.from("diary_entries").insert(row).select("id");
  if (error) throw new Error(diaryError(error));
  if (!data?.length) throw new Error(DIARY_DENIED);
  return String(data[0]!.id);
}

export async function removeEntry(sb: Sb, id: string): Promise<void> {
  const { data, error } = await sb.from("diary_entries").delete().eq("id", id).select("id");
  if (error) throw new Error(diaryError(error));
  if (!data?.length) throw new Error(DIARY_DENIED);
}

export type DiaryWeek = {
  days: string[];
  today: string;
  entries: DiaryEntry[];
  wards: { id: string; name: string }[];
};

/** The week that holds `anyDay`, and the campaign's wards to file entries under. */
export async function loadWeek(sb: Sb, anyDay: string): Promise<DiaryWeek> {
  const days = weekOf(anyDay);
  const [entries, wards] = await Promise.all([
    loadDiary(sb, days[0]!, days[6]!),
    sb.from("wards").select("id, name").order("name"),
  ]);
  return {
    days,
    today: nairobiToday(),
    entries,
    wards: (wards.data ?? []).map((w) => ({ id: String(w.id), name: String(w.name) })),
  };
}

export const getDiaryWeek = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { week?: string } | undefined) => {
    const w = String(input?.week ?? "");
    return { week: /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : nairobiToday() };
  })
  .handler(async ({ data, context }) => loadWeek(context.supabase, data.week));

export const saveDiaryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DiaryInput) => cleanEntry(input))
  .handler(async ({ data, context }) => ({ id: await writeEntry(context.supabase, data) }));

export const removeDiaryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Which one?");
    return { id: String(input.id) };
  })
  .handler(async ({ data, context }) => {
    await removeEntry(context.supabase, data.id);
    return { ok: true };
  });
