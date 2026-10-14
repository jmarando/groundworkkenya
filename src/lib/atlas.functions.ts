// The election atlas read as the signed-in person: every team reads the public
// figures, and its home area, sides, notes and profiles of places come from its
// own campaign only. The candidate's or manager's changes (and, for profiles, an
// organiser's) are checked here first and again by the database.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PROFILE_EDITORS,
  cleanProfile,
  type AreaProfile,
  type Language,
  type ProfileInput,
  type Settlement,
} from "@/lib/area-profile";
import type { IndicatorId } from "@/lib/atlas-files";
import type { AtlasData, Level } from "@/lib/atlas-view";
import { cleanHome, cleanNote, cleanSide } from "@/lib/elections-view";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: the atlas tables are newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export const ATLAS_DENIED = "Only the candidate or campaign manager can change this.";
const STAFF = ["super", "candidate", "manager"];

export async function loadAtlas(sb: Client): Promise<AtlasData> {
  const read = async <T>(table: string, cols: string): Promise<T[]> => {
    const { data, error } = (await sb.from(table).select(cols)) as {
      data: T[] | null;
      error: unknown;
    };
    if (error) throw new Error("Could not read the election atlas.");
    return data ?? [];
  };
  // The profiles' update: until Lovable applies its migration these tables
  // don't exist, and the atlas loads without them rather than not at all.
  const readSoft = async <T>(table: string, cols: string): Promise<T[]> => {
    const { data, error } = (await sb.from(table).select(cols)) as {
      data: T[] | null;
      error: unknown;
    };
    return error ? [] : (data ?? []);
  };
  const [
    areas,
    candidates,
    results,
    turnout,
    register,
    population,
    sources,
    settings,
    sides,
    notes,
    indicators,
    profiles,
  ] = await Promise.all([
    read<{ key: string; level: string; name: string; parent: string | null }>(
      "atlas_areas",
      "key, level, name, parent",
    ),
    read<{
      id: string;
      election_id: string;
      seat: string;
      name: string;
      party: string | null;
      bloc: string;
    }>("atlas_candidates", "id, election_id, seat, name, party, bloc"),
    read<{ candidate_id: string; area_key: string; votes: number; source_id: string }>(
      "atlas_results",
      "candidate_id, area_key, votes, source_id",
    ),
    read<{
      election_id: string;
      area_key: string;
      registered: number | null;
      cast_votes: number | null;
      rejected: number | null;
      valid: number | null;
      source_id: string;
    }>(
      "atlas_turnout",
      "election_id, area_key, registered, cast_votes, rejected, valid, source_id",
    ),
    read<{ year: number; area_key: string; registered: number; source_id: string }>(
      "atlas_register",
      "year, area_key, registered, source_id",
    ),
    read<{
      area_key: string;
      year: number;
      total: number;
      adults: number;
      young_adults: number;
      source_id: string;
    }>("atlas_population", "area_key, year, total, adults, young_adults, source_id"),
    read<{ id: string; title: string; publisher: string; url: string | null; note: string | null }>(
      "atlas_sources",
      "id, title, publisher, url, note",
    ),
    read<{ home_area: string }>("atlas_settings", "home_area"),
    read<{ election_id: string; bloc: string }>("atlas_sides", "election_id, bloc"),
    read<{ area_key: string; body: string; updated_at: string }>(
      "area_notes",
      "area_key, body, updated_at",
    ),
    readSoft<{
      area_key: string;
      indicator: string;
      year: number;
      value: number | string;
      source_id: string;
    }>("atlas_indicators", "area_key, indicator, year, value, source_id"),
    readSoft<{
      area_key: string;
      settlement: string | null;
      communities: string | null;
      languages: string[] | null;
      institutions: string | null;
      issues: string | null;
      updated_at: string;
      updated_by: string | null;
    }>(
      "area_profiles",
      "area_key, settlement, communities, languages, institutions, issues, updated_at, updated_by",
    ),
  ]);
  const editors = [
    ...new Set(profiles.map((p) => p.updated_by).filter((id): id is string => Boolean(id))),
  ];
  const names = new Map<string, string>();
  if (editors.length) {
    const { data: people } = (await sb
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", editors)) as { data: { user_id: string; full_name: string | null }[] | null };
    for (const p of people ?? []) if (p.full_name) names.set(p.user_id, p.full_name);
  }
  return {
    areas: areas.map((a) => ({
      key: a.key,
      level: a.level as Level,
      name: a.name,
      parent: a.parent,
    })),
    candidates: candidates.map((c) => ({
      id: c.id,
      election: c.election_id,
      seat: c.seat,
      name: c.name,
      party: c.party,
      bloc: c.bloc,
    })),
    results: results.map((r) => ({
      candidate: r.candidate_id,
      area: r.area_key,
      votes: r.votes,
      source: r.source_id,
    })),
    turnout: turnout.map((t) => ({
      election: t.election_id,
      area: t.area_key,
      registered: t.registered,
      cast: t.cast_votes,
      rejected: t.rejected,
      valid: t.valid,
      source: t.source_id,
    })),
    register: register.map((r) => ({
      year: r.year,
      area: r.area_key,
      registered: r.registered,
      source: r.source_id,
    })),
    population: population.map((p) => ({
      area: p.area_key,
      year: p.year,
      total: p.total,
      adults: p.adults,
      youngAdults: p.young_adults,
      source: p.source_id,
    })),
    sources,
    indicators: indicators.map((r) => ({
      area: r.area_key,
      indicator: r.indicator as IndicatorId,
      year: r.year,
      value: Number(r.value),
      source: r.source_id,
    })),
    homeArea: settings[0]?.home_area ?? null,
    sides: Object.fromEntries(sides.map((s) => [s.election_id, s.bloc])),
    notes: Object.fromEntries(
      notes.map((n) => [n.area_key, { body: n.body, updatedAt: n.updated_at }]),
    ),
    profiles: Object.fromEntries(
      profiles.map((p): [string, AreaProfile] => [
        p.area_key,
        {
          area: p.area_key,
          settlement: p.settlement as Settlement | null,
          communities: p.communities,
          languages: (p.languages ?? []) as Language[],
          institutions: p.institutions,
          issues: p.issues,
          updatedAt: p.updated_at,
          updatedBy: p.updated_by ? (names.get(p.updated_by) ?? null) : null,
        },
      ]),
    ),
  };
}

/** Only the candidate, the manager or the super admin change the campaign's atlas settings. */
async function mustBeStaff(sb: Client): Promise<void> {
  const { data } = (await sb.rpc("my_campaign_role")) as { data: unknown };
  if (!STAFF.includes(String(data))) throw new Error(ATLAS_DENIED);
}

function atlasError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return ATLAS_DENIED;
  if (e.code === "23503") return "That place or election isn't in the atlas.";
  if (e.code === "23514") return "The database refused that: keep a note to 2,000 characters.";
  return "Could not save that. Try again.";
}

async function done(
  q: PromiseLike<{ error: { code?: string; message?: string } | null }>,
): Promise<void> {
  const { error } = await q;
  if (error) throw new Error(atlasError(error));
}

export async function writeHome(sb: Client, area: string): Promise<void> {
  await mustBeStaff(sb);
  await done(sb.from("atlas_settings").upsert({ home_area: area }, { onConflict: "campaign_id" }));
}

export async function writeSide(sb: Client, election: string, bloc: string | null): Promise<void> {
  await mustBeStaff(sb);
  await done(
    bloc
      ? sb
          .from("atlas_sides")
          .upsert({ election_id: election, bloc }, { onConflict: "campaign_id,election_id" })
      : sb.from("atlas_sides").delete().eq("election_id", election),
  );
}

export async function writeNote(sb: Client, area: string, body: string): Promise<void> {
  await mustBeStaff(sb);
  await done(
    sb.from("area_notes").upsert({ area_key: area, body }, { onConflict: "campaign_id,area_key" }),
  );
}

export async function removeNote(sb: Client, area: string): Promise<void> {
  await mustBeStaff(sb);
  await done(sb.from("area_notes").delete().eq("area_key", area));
}

export const PROFILE_DENIED =
  "Only the candidate, campaign manager or an organiser can change this.";

function profileError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return PROFILE_DENIED;
  if (e.code === "23503") return "That place isn't in the atlas.";
  if (e.code === "23514") return "The database refused that: keep each box within its limit.";
  return "Could not save that. Try again.";
}

/** A place's profile, replaced whole: checked here for the role, and again by the database. */
export async function writeProfile(sb: Client, p: ProfileInput): Promise<void> {
  const { data } = (await sb.rpc("my_campaign_role")) as { data: unknown };
  if (!(PROFILE_EDITORS as readonly string[]).includes(String(data)))
    throw new Error(PROFILE_DENIED);
  const { error } = (await sb.from("area_profiles").upsert(
    {
      area_key: p.area,
      settlement: p.settlement,
      communities: p.communities,
      languages: p.languages,
      institutions: p.institutions,
      issues: p.issues,
    },
    { onConflict: "campaign_id,area_key" },
  )) as { error: { code?: string; message?: string } | null };
  if (error) throw new Error(profileError(error));
}

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => cleanProfile(input))
  .handler(async ({ data, context }) => {
    await writeProfile(context.supabase as never, data);
    return { ok: true };
  });

export const getAtlas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AtlasData> => loadAtlas(context.supabase as never));

export const saveHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { area: string }) => cleanHome(input))
  .handler(async ({ data, context }) => {
    await writeHome(context.supabase as never, data.area);
    return { ok: true };
  });

export const saveSide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { election: string; bloc: string | null }) => cleanSide(input))
  .handler(async ({ data, context }) => {
    await writeSide(context.supabase as never, data.election, data.bloc);
    return { ok: true };
  });

export const saveNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { area: string; body: string }) => cleanNote(input))
  .handler(async ({ data, context }) => {
    await writeNote(context.supabase as never, data.area, data.body);
    return { ok: true };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { area: string }) => cleanHome(input))
  .handler(async ({ data, context }) => {
    await removeNote(context.supabase as never, data.area);
    return { ok: true };
  });
