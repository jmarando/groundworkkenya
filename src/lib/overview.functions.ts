import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pageAll } from "@/lib/page-all";

const STATUTORY_LIMIT = 433_800_000;

export type OverviewData = {
  supporters: number;
  supporterTarget: number;
  wardsOnTrack: number;
  wardsTotal: number;
  contactsThisWeek: number;
  contactsLastWeek: number;
  spendKes: number;
  statutoryLimit: number;
  biggestGap: { name: string; constituency: string; gap: number } | null;
  offPace: { name: string; constituency: string; gap: number }[];
  growth: { label: string; value: number }[];
  quick: {
    people: number;
    unread: number;
    openIncidents: number;
    unstaffed: number;
    activePolls: number;
  };
};

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
};

/**
 * The campaign's live numbers, read as the signed-in person. People tagged
 * "sample" never count, and each ward's gap is its real consented supporters
 * against its target, not a figure stored on the ward.
 */
export async function loadOverview(sb: Client): Promise<OverviewData> {
  const real = <Q extends { not: (c: string, op: string, v: string) => Q }>(q: Q) =>
    q.not("tags", "cs", "{sample}");

  const [
    { data: wards },
    consented,
    { data: expenses },
    { data: recent },
    { count: peopleCount },
    { count: unread },
    { count: openIncidents },
    { count: unstaffed },
    { count: activePolls },
  ] = await Promise.all([
    sb.from("wards").select("id, name, constituency, target_votes"),
    pageAll<{ ward_id: string | null; created_at: string }>((from, to) =>
      real(
        sb
          .from("people")
          .select("ward_id, created_at")
          .eq("opted_out", false)
          .eq("consent_sms", true),
      ).range(from, to),
    ),
    sb.from("expenses").select("amount_kes").eq("statutory", true),
    sb.from("messages").select("created_at").eq("direction", "out"),
    real(sb.from("people").select("id", { count: "exact", head: true })),
    sb.from("conversations").select("id", { count: "exact", head: true }).eq("unread", true),
    sb.from("incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
    sb
      .from("polling_stations")
      .select("id", { count: "exact", head: true })
      .eq("status", "unstaffed"),
    sb.from("polls").select("id", { count: "exact", head: true }).eq("status", "live"),
  ]);

  const perWard = new Map<string, number>();
  for (const p of consented)
    if (p.ward_id) perWard.set(p.ward_id, (perWard.get(p.ward_id) ?? 0) + 1);

  const wardRows = (wards ?? []) as {
    id: string;
    name: string;
    constituency: string;
    target_votes: number | null;
  }[];
  const supporterTarget = wardRows.reduce((s, w) => s + (w.target_votes ?? 0), 0);
  const gaps = wardRows
    .map((w) => ({
      name: w.name,
      constituency: w.constituency,
      gap: (perWard.get(w.id) ?? 0) - (w.target_votes ?? 0),
    }))
    .sort((a, b) => a.gap - b.gap);

  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const stamps = ((recent ?? []) as { created_at: string }[]).map((m) =>
    new Date(m.created_at).getTime(),
  );
  const contactsThisWeek = stamps.filter((t) => now - t < week).length;
  const contactsLastWeek = stamps.filter((t) => now - t >= week && now - t < 2 * week).length;

  const spendKes = ((expenses ?? []) as { amount_kes: unknown }[]).reduce(
    (s, e) => s + Number(e.amount_kes ?? 0),
    0,
  );

  // Supporter growth over the last 8 months, cumulative.
  const buckets = new Map<string, number>();
  for (const p of consented) {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const months: { label: string; value: number }[] = [];
  let running = 0;
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    running += buckets.get(key) ?? 0;
    months.push({
      label: d.toLocaleString("en", { month: "short" }).toUpperCase(),
      value: running,
    });
  }

  return {
    supporters: consented.length,
    supporterTarget,
    wardsOnTrack: gaps.filter((g) => g.gap >= 0).length,
    wardsTotal: wardRows.length,
    contactsThisWeek,
    contactsLastWeek,
    spendKes,
    statutoryLimit: STATUTORY_LIMIT,
    biggestGap: gaps[0] ?? null,
    offPace: gaps.filter((g) => g.gap < 0).slice(0, 5),
    growth: months,
    quick: {
      people: peopleCount ?? 0,
      unread: unread ?? 0,
      openIncidents: openIncidents ?? 0,
      unstaffed: unstaffed ?? 0,
      activePolls: activePolls ?? 0,
    },
  };
}

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OverviewData> => loadOverview(context.supabase as never));
