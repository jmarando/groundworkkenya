// Paid media's server side, as the signed-in person: row level security keeps buys inside the
// campaign and to the candidate and managers, and the database posts each booking to Finance.
// The read fails soft: before schema 29 there is no media_buys table, so the screen goes on
// without buys.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkBuy, type BuyRow } from "@/lib/media";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MediaData = { buys: BuyRow[]; available: boolean };

export const getMediaBuys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MediaData> => {
    const { data, error } = await context.supabase
      .from("media_buys")
      .select(
        "id, platform, name, starts_on, ends_on, amount_kes, paid_for_by, impressions, reach, clicks, results_on, wards(name), expenses(status)",
      )
      .order("starts_on", { ascending: false })
      .limit(200);
    if (error) {
      console.error("Reading ad buys failed", error.message);
      return { buys: [], available: false };
    }
    return {
      available: true,
      buys: (data ?? []).map((r) => {
        const ward = r.wards as unknown as { name: string } | null;
        const expense = r.expenses as unknown as { status: string } | null;
        return {
          id: r.id,
          platform: r.platform,
          name: r.name,
          wardName: ward?.name ?? null,
          startsOn: r.starts_on,
          endsOn: r.ends_on,
          amountKes: Number(r.amount_kes),
          paidForBy: r.paid_for_by,
          impressions: r.impressions,
          reach: r.reach,
          clicks: r.clicks,
          resultsOn: r.results_on,
          expenseStatus: expense?.status ?? null,
        };
      }),
    };
  });

export const bookMediaBuy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const c = checkBuy(input);
    if (!c.ok) throw new Error(c.why);
    return c.buy;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("media_buys").insert({
      platform: data.platform,
      name: data.name,
      ward_id: data.wardId,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      amount_kes: data.amountKes,
      paid_for_by: data.paidForBy,
      external_id: data.externalId,
    });
    if (error) {
      if (error.code === "42501") throw new Error("Only the candidate and managers can book ads.");
      if (error.code === "23505") throw new Error("That platform id is already booked.");
      console.error("Booking an ad buy failed", error.message);
      throw new Error("Could not book that ad.");
    }
    return { ok: true };
  });

/** What a buy delivered, from the platform's report: whole numbers, none negative. */
export const recordMediaResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      impressions?: number | null;
      reach?: number | null;
      clicks?: number | null;
    }) => {
      if (!input || typeof input.id !== "string" || !UUID.test(input.id))
        throw new Error("Which buy?");
      const n = (v: unknown) => {
        if (v === null || v === undefined || v === "") return null;
        const x = Number(v);
        if (!Number.isInteger(x) || x < 0) throw new Error("Results are whole numbers.");
        return x;
      };
      return {
        id: input.id,
        impressions: n(input.impressions),
        reach: n(input.reach),
        clicks: n(input.clicks),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("media_buys")
      .update({
        impressions: data.impressions,
        reach: data.reach,
        clicks: data.clicks,
        results_on: new Date().toISOString().slice(0, 10),
      })
      .eq("id", data.id);
    if (error) {
      console.error("Recording ad results failed", error.message);
      throw new Error("Could not save those results.");
    }
    return { ok: true };
  });
