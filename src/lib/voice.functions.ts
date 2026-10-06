// Calling a voter from the Inbox through Twilio. Twilio rings the team member's
// phone first, then connects them; the voter sees the campaign's number.
// Reading the conversation as the signed-in user keeps it to their campaign.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const callFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; myPhone: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(input?.conversationId ?? "")))
      throw new Error("Pick a conversation first.");
    return { conversationId: input.conversationId, myPhone: String(input?.myPhone ?? "") };
  })
  .handler(async ({ data, context }) => {
    const { twilioVoiceConfigured, bridgeCall } = await import("@/lib/twilio.server");
    const { phoneKey } = await import("@/lib/at.server");
    if (!twilioVoiceConfigured())
      return { ok: false as const, error: "Calling starts once the Twilio number is added." };

    const mine = phoneKey(data.myPhone);
    if (mine.length < 9) return { ok: false as const, error: "Enter the phone number to ring you on." };

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
    const theirs = phoneKey(person?.phone);
    if (!person || theirs.length < 9) return { ok: false as const, error: "No phone number for this person." };

    const r = await bridgeCall(mine, theirs, person.full_name ?? "the voter");
    if (!r.ok) {
      console.error(`Twilio call failed: ${r.error}`);
      return { ok: false as const, error: "Twilio could not place the call. Try again shortly." };
    }
    return { ok: true as const };
  });
