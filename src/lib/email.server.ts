// Email as an Inbox channel. Outbound goes through Lovable's managed sender
// from "<Campaign name>" <noreply@groundwork.ke>, with Reply-To set to a
// per-conversation address on in.groundwork.ke so the reply threads back.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const INBOUND_DOMAIN = "in.groundwork.ke";

export function replyAddress(slug: string, conversationId: string) {
  return `${slug}+${conversationId}@${INBOUND_DOMAIN}`;
}

/** Parse "slug+uuid@in.groundwork.ke" (or "slug@…"). */
export function parseInboundAddress(addr: string): { slug: string; conversationId: string | null } | null {
  const m = addr.trim().toLowerCase().match(/^([a-z0-9-]+)(?:\+([0-9a-f-]{36}))?@/);
  return m ? { slug: m[1], conversationId: m[2] ?? null } : null;
}

export async function sendConversationEmail(
  sb: SupabaseClient<Database>,
  convo: { id: string; person_id: string | null; subject?: string | null },
  body: string,
  senderName: string | null,
): Promise<{ status: string; note: string }> {
  if (!convo.person_id) throw new Error("This conversation has no person attached.");
  const [{ data: person }, { data: campaignId }] = await Promise.all([
    sb.from("people").select("email, full_name, opted_out").eq("id", convo.person_id).maybeSingle(),
    sb.rpc("my_campaign"),
  ]);
  if (!person?.email) throw new Error("There is no email address on this person.");
  if (person.opted_out) throw new Error("They asked not to be contacted. Nothing was sent.");
  const { data: campaign } = await sb
    .from("campaigns")
    .select("slug, name")
    .eq("id", campaignId as string)
    .maybeSingle();
  if (!campaign) throw new Error("No campaign is open.");

  const subject = convo.subject
    ? convo.subject.startsWith("Re:") ? convo.subject : `Re: ${convo.subject}`
    : `A message from ${campaign.name}`;

  const { data: inserted, error } = await sb
    .from("messages")
    .insert({
      person_id: convo.person_id,
      conversation_id: convo.id,
      channel: "email",
      platform: "email",
      kind: "dm",
      direction: "out",
      body,
      status: "sending",
      outbox_kind: "inbox_reply",
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error("The email could not be saved.");

  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  let status = "accepted";
  let failure: string | null = null;
  try {
    const r = await sendTemplateEmail("campaign-message", person.email, {
      templateData: { campaignName: campaign.name, subject, body, senderName },
      idempotencyKey: `inbox-${inserted.id}`,
      replyTo: replyAddress(campaign.slug, convo.id),
      fromName: campaign.name,
    });
    if (!r.sent) {
      status = "failed";
      failure = "This address bounced or unsubscribed earlier, so email to it is blocked.";
    }
  } catch (e) {
    status = "failed";
    failure = e instanceof Error ? e.message : "The email could not be sent.";
  }
  await sb
    .from("messages")
    .update(status === "accepted" ? { status, sent_at: new Date().toISOString() } : { status, error: failure })
    .eq("id", inserted.id);
  await sb
    .from("conversations")
    .update({ unread: false, last_message_at: new Date().toISOString(), snippet: body, subject })
    .eq("id", convo.id);
  if (failure) throw new Error(failure);
  return { status, note: "Email sent. Their reply comes back to this thread." };
}
