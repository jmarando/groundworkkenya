// Calling a voter from the Inbox through Twilio. Twilio rings the team member's phone first, then
// connects them; the voter sees the campaign's number. Each call is kept (voice_calls, schema 42)
// and Twilio reports every step to it, so the screen can say where the call is (getCall).
// Reading the conversation as the signed-in user keeps it to their campaign.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { describeCall, phoneDigits, twilioError, type CallView } from "@/lib/call-status";
import { requireOffice } from "@/lib/require-role";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: voice_calls is newer than the generated types
  from: (table: string) => any;
};

export const callFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; myPhone: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(input?.conversationId ?? "")))
      throw new Error("Pick a conversation first.");
    return { conversationId: input.conversationId, myPhone: String(input?.myPhone ?? "") };
  })
  .handler(async ({ data, context }) => {
    await requireOffice(context.supabase, "Calls are placed by the campaign office.");
    const { twilioVoiceConfigured, bridgeCall } = await import("@/lib/twilio.server");
    if (!twilioVoiceConfigured())
      return { ok: false as const, error: "Calling starts once the Twilio number is added." };
    const followed = Boolean(process.env["TWILIO_CALLBACK_TOKEN"]);

    // The office line takes the call (the number incoming calls already ring), unless a phone is given.
    const mine =
      phoneDigits(data.myPhone) || phoneDigits(process.env["TWILIO_VOICE_FORWARD_TO"] ?? "");
    if (!mine) return { ok: false as const, error: "needs-phone" };

    const { data: convo } = await context.supabase
      .from("conversations")
      .select("id, person_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!convo?.person_id) return { ok: false as const, error: "That conversation has no person." };
    const { data: person } = await context.supabase
      .from("people")
      .select("full_name, phone, opted_out")
      .eq("id", convo.person_id)
      .maybeSingle();
    const theirs = phoneDigits(person?.phone ?? "");
    if (!person || !theirs)
      return { ok: false as const, error: "No phone number for this person." };
    if (person.opted_out)
      return {
        ok: false as const,
        error: "They asked not to be contacted, so they aren't called.",
      };
    if (theirs === mine) return { ok: false as const, error: "That's your own number." };

    const sb = context.supabase as unknown as Client;
    const { data: row, error } = (await sb
      .from("voice_calls")
      .insert({
        kind: "bridge",
        person_id: convo.person_id,
        conversation_id: convo.id,
        to_phone: theirs,
        staff_phone: mine,
      })
      .select("id")
      .single()) as { data: { id: string } | null; error: unknown };
    if (error || !row) return { ok: false as const, error: "The call couldn't be recorded." };

    const r = await bridgeCall(mine, theirs, person.full_name ?? "the voter", row.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Client;
    if (!r.ok) {
      console.error(`Twilio call failed: ${r.error}`);
      await admin
        .from("voice_calls")
        .update({ status: "failed", error: r.error.slice(0, 300) })
        .eq("id", row.id);
      return {
        ok: false as const,
        error: twilioError(r.error) ?? "Twilio couldn't place the call.",
      };
    }
    await admin.from("voice_calls").update({ sid: r.sid, status: "initiated" }).eq("id", row.id);
    return { ok: true as const, callId: followed ? row.id : null };
  });

/** Where a call is now, in words, from Twilio's reports. */
export const getCall = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/.test(String(input?.id ?? ""))) throw new Error("No such call.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<CallView & { at: string }> => {
    await requireOffice(context.supabase);
    const sb = context.supabase as unknown as Client;
    const { data: c } = (await sb
      .from("voice_calls")
      .select(
        "kind, status, voter_status, answered_by, duration, digits, error, created_at, updated_at",
      )
      .eq("id", data.id)
      .maybeSingle()) as {
      data: {
        kind: "blast" | "test" | "bridge";
        status: string;
        voter_status: string | null;
        answered_by: string | null;
        duration: number | null;
        digits: string | null;
        error: string | null;
        created_at: string;
        updated_at: string;
      } | null;
    };
    if (!c) throw new Error("That call isn't on record.");
    const view = describeCall(c);
    // No report for three minutes means Twilio's callbacks aren't reaching Groundwork.
    if (view.live && Date.now() - Date.parse(c.updated_at) > 180_000)
      return {
        live: false,
        tone: "bad",
        text: "Twilio stopped reporting on this call. Check that the call-status address is reachable.",
        ...(view.steps ? { steps: view.steps } : {}),
        at: c.updated_at,
      };
    return { ...view, at: c.updated_at };
  });

/** Whether calls go to the office line without asking for a phone. */
export const callSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOffice(context.supabase);
    return { officeLine: Boolean(phoneDigits(process.env["TWILIO_VOICE_FORWARD_TO"] ?? "")) };
  });
