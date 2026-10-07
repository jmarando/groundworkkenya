import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parsePollRecipients } from "@/lib/poll-recipients";
import { firstName, fillTemplate, WA_TEMPLATES_ALL } from "@/lib/wa-templates";

export const invitePollIndividuals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pollId: string; channel: "whatsapp" | "email"; recipients: string; permission: boolean }) => {
    if (!input?.pollId || !["whatsapp", "email"].includes(input.channel)) throw new Error("Choose a poll and channel.");
    if (!input.permission) throw new Error("Confirm that these recipients agreed to receive this invitation.");
    return { ...input, addresses: parsePollRecipients(input.recipients, input.channel) };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: superAdmin, error: adminError }, { data: role, error: roleError }, { data: campaignId, error: campaignError }] = await Promise.all([
      sb.rpc("is_super_admin", { _user_id: context.userId }), sb.rpc("my_campaign_role"), sb.rpc("my_campaign"),
    ]);
    if (adminError || roleError || campaignError || !campaignId || (!superAdmin && !["candidate", "manager"].includes(String(role))))
      throw new Error("Only the candidate or campaign manager can send poll invitations.");
    const [{ data: poll, error: pollError }, { data: campaign, error: nameError }] = await Promise.all([
      sb.from("polls").select("id, code, question, status, channels, closes_at").eq("id", data.pollId).eq("campaign_id", campaignId).maybeSingle(),
      sb.from("campaigns").select("name, slug, owns_channels").eq("id", campaignId).single(),
    ]);
    if (pollError || nameError || !poll || !campaign) throw new Error("This poll is not available in the current campaign.");
    if (!["draft", "live"].includes(poll.status) || (poll.closes_at && Date.parse(poll.closes_at) <= Date.now()))
      throw new Error("This poll has closed. Create a new poll before sending.");
    if (data.channel === "whatsapp" && !campaign.owns_channels)
      throw new Error("This campaign does not yet have its own WhatsApp sending connection.");
    const { sendWhatsAppTemplate, whatsappConfigured, recoverPending } = await import("@/lib/whatsapp.server");
    if (data.channel === "whatsapp" && !whatsappConfigured()) throw new Error("WhatsApp is not connected.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { replyAddress } = await import("@/lib/email.server");
    const template = WA_TEMPLATES_ALL.find((t) => t.name === "poll_invitation_v2");
    if (!template) throw new Error("The poll invitation template is unavailable.");
    const link = `https://groundwork.ke/p/${encodeURIComponent(poll.code)}`;
    const results: { recipient: string; status: string; note: string }[] = [];
    let opened = false;
    for (const address of data.addresses) {
      const { data: people, error: peopleError } = await sb.from("people")
        .select("id, phone, email, full_name, opted_out, consent_whatsapp")
        .eq("campaign_id", campaignId)
        .eq(data.channel === "email" ? "email" : "phone", address);
      if (peopleError) throw new Error("Could not check recipients.");
      const person = people?.length === 1 ? people[0] : undefined;
      if (!person) {
        results.push({ recipient: address, status: "skipped", note: "Add or check this contact in People first, in this campaign." });
        continue;
      }
      if (person.opted_out || (data.channel === "whatsapp" && !person.consent_whatsapp)) {
        results.push({ recipient: address, status: "skipped", note: person.opted_out ? "Opted out." : "WhatsApp permission is not recorded in People." });
        continue;
      }
      if (!opened) {
        const { data: updated, error } = await sb.from("polls").update({
          channels: [...new Set([...poll.channels, "web"])],
          ...(poll.status === "draft" ? { status: "live", opens_at: new Date().toISOString(), launched_at: new Date().toISOString() } : {}),
        }).eq("id", poll.id).eq("campaign_id", campaignId).in("status", ["draft", "live"]).select("id");
        if (error || !updated?.length) throw new Error("Could not open this poll for individual replies.");
        opened = true;
      }
      const { data: invite, error: inviteError } = await sb.from("poll_invites").insert({
        poll_id: poll.id, person_id: person.id, channel: data.channel, campaign_id: campaignId,
      }).select("id").single();
      if (inviteError?.code === "23505") {
        results.push({ recipient: address, status: "skipped", note: "Already invited on this channel; check Inbox for the earlier outcome." });
        continue;
      }
      if (inviteError || !invite) throw new Error("Could not reserve this invitation; nothing further was sent.");
      const params = [firstName(person.full_name), campaign.name, link];
      const body = data.channel === "whatsapp" ? fillTemplate(template.text, params)
        : `Hello ${firstName(person.full_name)},\n\n${campaign.name} would value your views.\n\n${poll.question}\n\nTake part: ${link}\n\nReply to this email if you no longer want invitations.`;
      let { data: conversation, error: convoError } = await sb.from("conversations").select("id")
        .eq("campaign_id", campaignId).eq("person_id", person.id).eq("platform", data.channel)
        .order("last_message_at", { ascending: false }).limit(1).maybeSingle();
      if (convoError) throw new Error("Could not check the invitation's Inbox thread.");
      if (!conversation) {
        const created = await sb.from("conversations").insert({
          person_id: person.id, campaign_id: campaignId, platform: data.channel, channel: data.channel,
          external_thread_id: `${data.channel}:${address.replace(/^\+/, "")}`, subject: `Poll: ${poll.question}`,
          snippet: body, unread: false, status: "open",
        }).select("id").single();
        if (created.error || !created.data) throw new Error("Could not create an Inbox thread; invitation was not sent.");
        conversation = created.data;
      }
      const { data: message, error: messageError } = await sb.from("messages").insert({
        campaign_id: campaignId, person_id: person.id, poll_id: poll.id, conversation_id: conversation.id,
        phone: person.phone, channel: data.channel, platform: data.channel, direction: "out",
        body, status: "sending", outbox_kind: "poll_invite", provider_ref: `poll-invite:${invite.id}`,
      }).select("id").single();
      if (messageError || !message) throw new Error("Could not save the invitation; nothing was sent to this recipient.");
      let status = "accepted";
      let note = "Accepted for sending; delivery is not yet confirmed.";
      let externalId: string | null = null;
      try {
        if (data.channel === "whatsapp") {
          const result = await sendWhatsAppTemplate(person.phone, template.name, template.language, params);
          if (!result.ok) throw new Error(result.error);
          externalId = result.id;
        } else {
          const result = await sendTemplateEmail("campaign-message", address, {
            templateData: { campaignName: campaign.name, subject: `Poll: ${poll.question}`, body, senderName: campaign.name },
            idempotencyKey: `poll-invite-${invite.id}`, replyTo: replyAddress(campaign.slug, conversation.id), fromName: campaign.name,
          });
          if (!result.sent) throw new Error("Email is blocked because this address previously bounced or unsubscribed.");
        }
      } catch (error) {
        note = error instanceof Error ? error.message : "Sending failed.";
        status = note.includes("Outcome unknown") ? "sending" : "failed";
      }
      const { error: saveError } = await sb.from("messages").update({ status, external_id: externalId,
        ...(status === "accepted" ? {} : { error: note }),
      }).eq("id", message.id);
      if (saveError) throw new Error("Invitation outcome could not be saved. Check Inbox before trying again.");
      const { error: threadError } = await sb.from("conversations").update({ snippet: body, last_message_at: new Date().toISOString(), unread: false }).eq("id", conversation.id);
      if (threadError) throw new Error("Invitation was processed but its Inbox summary could not be updated.");
      results.push({ recipient: address, status, note });
    }
    if (data.channel === "whatsapp") await recoverPending(supabaseAdmin);
    return { results, link };
  });