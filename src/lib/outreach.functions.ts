// Recording an approach to a voice: the invitation that went out and where it stands. The candidate
// and managers only; the caller's own campaign only (the database sees to that). Nothing here sends
// anything: the office copies the invitation and sends it themselves, by WhatsApp or a direct message.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRINCIPAL_ROLES } from "@/lib/access";
import { loose } from "@/lib/loose-client";
import { checkApproach, checkStatus } from "@/lib/outreach";
import { requireRole } from "@/lib/require-role";

const REFUSAL = "Only the candidate and managers brief voices.";

/** Records that a voice was approached with this invitation; approaching one again keeps its status. */
export const saveApproach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const checked = checkApproach(input);
    if (!checked.ok) throw new Error(checked.why);
    return checked.approach;
  })
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, PRINCIPAL_ROLES, REFUSAL);
    const { error } = await loose(context.supabase).from("voice_outreach").upsert(
      {
        voice_key: data.voice.key,
        platform: data.voice.platform,
        name: data.voice.name,
        url: data.voice.url,
        invitation: data.invitation,
        channel: data.channel,
      },
      { onConflict: "campaign_id,voice_key" },
    );
    if (error) throw new Error("That approach could not be recorded.");
    return { ok: true };
  });

/** Moves an approach to another status, by hand, until Daraja Pulse reports it. */
export const setApproachStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const checked = checkStatus(input);
    if (!checked.ok) throw new Error(checked.why);
    return { key: checked.key, status: checked.status };
  })
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, PRINCIPAL_ROLES, REFUSAL);
    const { data: rows, error } = await loose(context.supabase)
      .from("voice_outreach")
      .update({ status: data.status })
      .eq("voice_key", data.key)
      .select("id");
    if (error) throw new Error("That status could not be set.");
    if (!rows || rows.length === 0) throw new Error("That voice has not been approached yet.");
    return { ok: true };
  });
