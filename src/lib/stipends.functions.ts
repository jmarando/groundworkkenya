// Stipends from the field plan to the ledger, as the signed-in person: the database decides who
// handles money (the candidate and managers) and that nothing is paid twice.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Failure = { code?: string; message?: string };
type Sb = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: Failure | null }>;
};
const refused = (e: Failure, fallback: string) =>
  new Error(
    (e.code === "P0001" || e.code === "42501" || e.code === "22023") && e.message
      ? e.message
      : fallback,
  );
const sbOf = (context: { supabase: unknown }) => context.supabase as Sb;

/** One pending stipend per person per day they knocked doors on a walk list in the window. */
export const makeStipends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string; rate: number }) => {
    if (!input || !DATE.test(String(input.from)) || !DATE.test(String(input.to)))
      throw new Error("Give the days.");
    const rate = Math.round(Number(input.rate));
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Give a day's rate in shillings.");
    return { from: input.from, to: input.to, rate };
  })
  .handler(async ({ data, context }) => {
    const { data: n, error } = await sbOf(context).rpc("stipends_from_field", {
      _from: data.from,
      _to: data.to,
      _rate: data.rate,
    });
    if (error) throw refused(error, "Could not make the stipends.");
    return { added: Number(n ?? 0) };
  });

export const approveStipendLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => {
    const ids = Array.isArray(input?.ids)
      ? input.ids.filter((x) => UUID.test(String(x))).slice(0, 500)
      : [];
    if (!ids.length) throw new Error("Pick the lines to approve.");
    return { ids };
  })
  .handler(async ({ data, context }) => {
    const { data: n, error } = await sbOf(context).rpc("approve_stipends", { _ids: data.ids });
    if (error) throw refused(error, "Could not approve them.");
    return { approved: Number(n ?? 0) };
  });

/** Paid by hand (from a phone, say): the M-Pesa receipt makes it paid and posts it to Finance. */
export const recordStipendReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; receipt: string }) => {
    if (!input || !UUID.test(String(input.id))) throw new Error("Which stipend?");
    const receipt = String(input.receipt ?? "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9-]{6,40}$/.test(receipt))
      throw new Error("Give the M-Pesa receipt (letters and numbers).");
    return { id: input.id, receipt };
  })
  .handler(async ({ data, context }) => {
    const { error } = await sbOf(context).rpc("record_stipend_paid", {
      _id: data.id,
      _receipt: data.receipt,
    });
    if (error) throw refused(error, "Could not record the payment.");
    return { ok: true as const };
  });

/** Back to approved after a payout M-Pesa never answered, once the statement shows nothing went. */
export const releaseStipendPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input || !UUID.test(String(input.id))) throw new Error("Which stipend?");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await sbOf(context).rpc("release_stipend_payment", { _id: data.id });
    if (error) throw refused(error, "Could not release it.");
    return { ok: true as const };
  });

export const mpesaReady = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { mpesaConfigured } = await import("@/lib/mpesa.server");
    return { ready: mpesaConfigured() };
  });

/** Pays one approved stipend by M-Pesa. The answer comes to the callback; this only sends it. */
export const payStipendByMpesa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input || !UUID.test(String(input.id))) throw new Error("Which stipend?");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { mpesaConfigured, sendB2C } = await import("@/lib/mpesa.server");
    if (!mpesaConfigured())
      throw new Error("M-Pesa payouts aren't connected yet. Record the receipt by hand.");
    const sb = sbOf(context);
    const { data: rows, error } = await sb.rpc("begin_stipend_payment", { _id: data.id });
    if (error) throw refused(error, "Could not start the payout.");
    const r = (Array.isArray(rows) ? rows[0] : null) as {
      request_id: string;
      phone: string;
      amount_kes: number | string;
      agent_name: string;
    } | null;
    if (!r) throw new Error("Could not start the payout.");
    const sent = await sendB2C({
      requestId: r.request_id,
      phone: r.phone,
      amountKes: Number(r.amount_kes),
      remarks: `Stipend ${r.agent_name}`,
    });
    if (sent.accepted) return { status: "sent" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Sb;
    if (sent.unclear) {
      const noted = await admin.rpc("stipend_payment_unclear", { _request: r.request_id, _note: sent.why });
      if (noted.error) console.error(`Could not note an unclear payout: ${noted.error.message}`);
      return { status: "unclear" as const, why: sent.why };
    }
    const failed = await admin.rpc("finish_stipend_payment", {
      _request: r.request_id,
      _ok: false,
      _receipt: null,
      _error: sent.why,
    });
    // Left as "sending" the stipend can't be paid again until someone releases it; say so.
    if (failed.error)
      throw new Error(`${sent.why} The payout is still marked sending; release it once you have checked the statement.`);
    throw new Error(sent.why);
  });
