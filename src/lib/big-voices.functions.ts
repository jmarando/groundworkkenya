// The data behind Listening's Big voices: the posts of a window of 7, 30 or 90 days (not capped at
// the latest 600), worked into the seat, county and country columns by src/lib/big-voices.ts. The
// campaign's office only; the caller's own campaign only (the database sees to that).

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRINCIPAL_ROLES } from "@/lib/access";
import { bigVoices, rivalVoiceKeys, type Column } from "@/lib/big-voices";
import { loadWindow } from "@/lib/listening-load.server";
import { loose } from "@/lib/loose-client";
import { toMention } from "@/lib/listening-mention";
import { requireOffice } from "@/lib/require-role";

export type BigVoicesData = {
  columns: Column[];
  days: number;
  /** There were more posts in the window than were read. */
  truncated: boolean;
  /** The candidate and managers brief voices. */
  canBrief: boolean;
  /** Voices already approached, by voice key. */
  approaches: Record<string, { status: string; at: string }>;
};

const DAYS = [7, 30, 90];

export const getBigVoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => ({
    days: DAYS.includes(Number(input?.days)) ? Number(input.days) : 30,
  }))
  .handler(async ({ data, context }): Promise<BigVoicesData> => {
    const sb = context.supabase;
    const role = await requireOffice(sb);
    const now = Date.now();

    const { data: campaignId } = await sb.rpc("my_campaign");
    const [
      { rows, truncated },
      { data: topics },
      { data: rivals },
      { data: accounts },
      { data: campaign },
    ] = await Promise.all([
      loadWindow(sb as never, { since: new Date(now - data.days * 86_400_000).toISOString() }),
      sb.from("listening_topics").select("id, label, kind"),
      sb.from("race_rivals").select("id, name, is_us, x, tiktok, facebook"),
      loose(sb).from("listening_accounts").select("voice_key, followers").limit(5000) as Promise<{
        data: { voice_key: string; followers: number | null }[] | null;
      }>,
      sb.from("campaigns").select("seat, map_area").eq("id", String(campaignId)).maybeSingle(),
    ]);

    // The county's name, from the first part of the campaign's map area ("nyeri/mathira" is Nyeri).
    const countyKey = String(campaign?.map_area ?? "").split("/")[0] ?? "";
    const { data: county } = countyKey
      ? await sb
          .from("atlas_areas")
          .select("name")
          .eq("key", countyKey)
          .eq("level", "county")
          .maybeSingle()
      : { data: null };

    const topicById = new Map((topics ?? []).map((t) => [t.id, t]));
    const rivalById = new Map((rivals ?? []).map((r) => [r.id, r]));
    return {
      columns: bigVoices(
        rows.map((r) => toMention(r, topicById, rivalById)),
        {
          now,
          days: data.days,
          followers: new Map((accounts ?? []).map((a) => [a.voice_key, a.followers])),
          rivalKeys: rivalVoiceKeys(rivals ?? []),
          labels: {
            seat: campaign?.seat ?? "Your seat",
            county: county?.name ?? "County news",
            country: "Kenya",
          },
        },
      ),
      days: data.days,
      truncated,
      canBrief: PRINCIPAL_ROLES.includes(role),
      approaches: {},
    };
  });
