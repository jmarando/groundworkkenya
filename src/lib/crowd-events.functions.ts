// Crowd events, read and decided as the signed-in person: row level security keeps each campaign
// to its own, lets the office read them and lets staff add one to the diary or set it aside.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { AHEAD_DAYS, CROWD_KINDS, upcoming, type CrowdEvent } from "@/lib/crowd-events";
import { addDays, nairobiToday } from "@/lib/nairobi-date";

type Sb = SupabaseClient<Database>;

const COLS =
  "id, kind, title, starts_on, starts_at, place, ward_id, crowd, why, source_url, source_name, status, diary_entry_id, wards(name)";

type Row = {
  id: string;
  kind: string;
  title: string;
  starts_on: string;
  starts_at: string | null;
  place: string | null;
  ward_id: string | null;
  crowd: string | null;
  why: string | null;
  source_url: string;
  source_name: string | null;
  status: string;
  diary_entry_id: string | null;
  wards: { name: string } | null;
};

export function eventFromRow(r: Row): CrowdEvent | null {
  const kind = CROWD_KINDS.find((k) => k === r.kind);
  const status = r.status === "added" || r.status === "dismissed" ? r.status : "new";
  if (!kind) return null;
  return {
    id: String(r.id),
    kind,
    title: r.title,
    day: r.starts_on,
    startsAt: r.starts_at ? r.starts_at.slice(0, 5) : null,
    place: r.place,
    wardId: r.ward_id,
    wardName: r.wards?.name ?? null,
    crowd: r.crowd,
    why: r.why,
    url: r.source_url,
    sourceName: r.source_name,
    status,
    diaryEntryId: r.diary_entry_id,
  };
}

/** The campaign's events from today to three weeks ahead, set-aside ones left out; none before schema 50. */
export async function loadCrowdEvents(sb: Sb, today = nairobiToday()): Promise<CrowdEvent[]> {
  const { data, error } = await sb
    .from("crowd_events")
    .select(COLS)
    .gte("starts_on", today)
    .lte("starts_on", addDays(today, AHEAD_DAYS))
    .neq("status", "dismissed")
    .order("starts_on")
    .limit(200);
  if (error) return [];
  const events = ((data ?? []) as unknown as Row[])
    .map(eventFromRow)
    .filter((e): e is CrowdEvent => e !== null);
  return upcoming(events, today);
}

export const CROWD_DENIED = "Only the campaign's staff can add events to the diary.";

function crowdError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return CROWD_DENIED;
  return "Could not do that. Try again.";
}

export const getCrowdEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    today: nairobiToday(),
    events: await loadCrowdEvents(context.supabase),
  }));

const idOf = (input: { id: string }) => {
  if (!input?.id || !/^[0-9a-f-]{36}$/i.test(String(input.id))) throw new Error("Which event?");
  return { id: String(input.id) };
};

/** Puts the event in the diary; gives back the diary entry. */
export const addCrowdEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idOf)
  .handler(async ({ data, context }) => {
    const { data: entry, error } = await context.supabase.rpc("add_crowd_event", {
      _event: data.id,
    });
    if (error) throw new Error(crowdError(error));
    return { entryId: String(entry) };
  });

export const dismissCrowdEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idOf)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("dismiss_crowd_event", { _event: data.id });
    if (error) throw new Error(crowdError(error));
    return { ok: true };
  });
