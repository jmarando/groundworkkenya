// The race, read and changed as the signed-in person. Row level security keeps
// each campaign to its own race and lets only the candidate or campaign
// manager change it; a change that reaches no row is treated as refused.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { nairobiToday } from "@/lib/demo/insights";
import {
  byRecency,
  cleanPoll,
  cleanRival,
  pollFromRow,
  rivalFromRow,
  type CleanPoll,
  type CleanRival,
  type PollInput,
  type PollRow,
  type RacePoll,
  type RaceRival,
  type RivalInput,
  type RivalRow,
} from "@/lib/race-data";

type Sb = SupabaseClient<Database>;

export const RACE_DENIED = "Only the candidate or campaign manager can change the race.";

const RIVAL_COLS = "id, name, party, office, is_us, tone, sort, facebook, x, tiktok, search_as";
const POLL_COLS =
  "id, pollster, fieldwork_from, fieldwork_to, published_on, sample_size, margin, source_url, shares, undecided, approval, disapproval";

/** Ours first, then in the order the team set, then by name. */
export async function loadRivals(sb: Sb): Promise<RaceRival[]> {
  const { data, error } = await sb.from("race_rivals").select(RIVAL_COLS);
  if (error) throw new Error("Could not read the race.");
  return ((data ?? []) as RivalRow[])
    .map(rivalFromRow)
    .sort(
      (a, b) => Number(b.isUs) - Number(a.isUs) || a.sort - b.sort || a.name.localeCompare(b.name),
    );
}

/** Newest first. */
export async function loadPolls(sb: Sb): Promise<RacePoll[]> {
  const { data, error } = await sb.from("race_polls").select(POLL_COLS);
  if (error) throw new Error("Could not read the polls.");
  return ((data ?? []) as PollRow[]).map(pollFromRow).sort(byRecency);
}

/** What to tell the person when the database says no. */
export function raceError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return RACE_DENIED;
  if (e.code === "23505")
    return e.message?.includes("one_us")
      ? "Only one candidate can be yours."
      : "That candidate is already on the list.";
  if (e.code === "23514") return "The database refused that: check the figures and the link.";
  return "Could not save that. Try again.";
}

export async function writeRival(sb: Sb, r: CleanRival): Promise<string> {
  const row = {
    name: r.name,
    party: r.party,
    office: r.office,
    is_us: r.isUs,
    tone: r.tone,
    sort: r.sort,
    facebook: r.facebook,
    x: r.x,
    tiktok: r.tiktok,
    search_as: r.searchAs,
  };
  const { data, error } = r.id
    ? await sb.from("race_rivals").update(row).eq("id", r.id).select("id")
    : await sb.from("race_rivals").insert(row).select("id");
  if (error) throw new Error(raceError(error));
  if (!data?.length) throw new Error(RACE_DENIED);
  return String(data[0]!.id);
}

export async function writePoll(sb: Sb, p: CleanPoll): Promise<string> {
  const row = {
    pollster: p.pollster,
    fieldwork_from: p.fieldworkFrom,
    fieldwork_to: p.fieldworkTo,
    published_on: p.publishedOn,
    sample_size: p.sampleSize,
    margin: p.margin,
    source_url: p.sourceUrl,
    shares: p.shares.map((s) => ({
      name: s.name,
      share: s.share,
      ...(s.rivalId ? { rival_id: s.rivalId } : {}),
    })) as Json,
    undecided: p.undecided,
    approval: p.approval,
    disapproval: p.disapproval,
  };
  const { data, error } = p.id
    ? await sb.from("race_polls").update(row).eq("id", p.id).select("id")
    : await sb.from("race_polls").insert(row).select("id");
  if (error) throw new Error(raceError(error));
  if (!data?.length) throw new Error(RACE_DENIED);
  return String(data[0]!.id);
}

export async function removeRow(
  sb: Sb,
  table: "race_rivals" | "race_polls",
  id: string,
): Promise<void> {
  const { data, error } = await sb.from(table).delete().eq("id", id).select("id");
  if (error) throw new Error(raceError(error));
  if (!data?.length) throw new Error(RACE_DENIED);
}

const idOnly = (input: { id: string }) => {
  if (!input?.id) throw new Error("Which one?");
  return { id: String(input.id) };
};

export const saveRival = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RivalInput) => cleanRival(input))
  .handler(async ({ data, context }) => ({ id: await writeRival(context.supabase, data) }));

export const removeRival = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idOnly)
  .handler(async ({ data, context }) => {
    await removeRow(context.supabase, "race_rivals", data.id);
    return { ok: true };
  });

export const savePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PollInput) => input)
  .handler(async ({ data, context }) => {
    // Shares are tied to the campaign's rivals as they are now.
    const rivals = await loadRivals(context.supabase);
    return { id: await writePoll(context.supabase, cleanPoll(data, rivals, nairobiToday())) };
  });

export const removePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idOnly)
  .handler(async ({ data, context }) => {
    await removeRow(context.supabase, "race_polls", data.id);
    return { ok: true };
  });
