import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
};

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OverviewData> => {
    const sb = context.supabase;

    const [{ data: wards }, { count: supporters }, { data: expenses }, { data: recent }] =
      await Promise.all([
        sb.from("wards").select("name, constituency, supporters, target_votes"),
        sb
          .from("people")
          .select("id", { count: "exact", head: true })
          .eq("opted_out", false)
          .eq("consent_sms", true),
        sb.from("expenses").select("amount_kes").eq("statutory", true),
        sb.from("messages").select("created_at").eq("direction", "out"),
      ]);

    const wardRows = wards ?? [];
    const supporterTarget = wardRows.reduce((s, w) => s + (w.target_votes ?? 0), 0);
    const gaps = wardRows
      .map((w) => ({
        name: w.name,
        constituency: w.constituency,
        gap: (w.supporters ?? 0) - (w.target_votes ?? 0),
      }))
      .sort((a, b) => a.gap - b.gap);

    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const stamps = (recent ?? []).map((m) => new Date(m.created_at as string).getTime());
    const contactsThisWeek = stamps.filter((t) => now - t < week).length;
    const contactsLastWeek = stamps.filter((t) => now - t >= week && now - t < 2 * week).length;

    const spendKes = (expenses ?? []).reduce((s, e) => s + Number(e.amount_kes ?? 0), 0);

    // Supporter growth over the last 8 months, cumulative.
    const { data: people } = await sb
      .from("people")
      .select("created_at")
      .eq("opted_out", false)
      .eq("consent_sms", true);
    const buckets = new Map<string, number>();
    for (const p of people ?? []) {
      const d = new Date(p.created_at as string);
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
      supporters: supporters ?? 0,
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
    };
  });
