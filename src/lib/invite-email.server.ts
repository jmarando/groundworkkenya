// Sends the "set your password" invite for a campaign, linking to that
// campaign's own address. Called only after the caller's right to invite has
// been checked by the invite_member database function.

export async function sendInviteEmail(campaignId: string, email: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: c } = await supabaseAdmin
    .from("campaigns")
    .select("host, slug, name")
    .eq("id", campaignId)
    .maybeSingle();
  const host = c?.host || (c?.slug ? `${c.slug}.groundwork.ke` : "groundwork.ke");
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `https://${host}/set-password`,
    data: { campaign: c?.name ?? null },
  });
  // Already has an account: invite_member added them directly, nothing to send.
  if (error && !/already|registered|exists/i.test(error.message)) {
    throw new Error(`Saved, but the invite email failed: ${error.message}`);
  }
}
