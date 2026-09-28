// Inbound channels (WhatsApp, SMS, USSD, social webhooks) arrive without a
// signed-in person, so they belong to the campaign that owns the channels.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

let cached: { id: string; at: number } | null = null;

export async function channelCampaignId(sb: SupabaseClient<Database>): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.id;
  const { data, error } = await sb
    .from("campaigns")
    .select("id")
    .eq("owns_channels", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("No campaign owns the messaging channels.");
  cached = { id: data.id, at: Date.now() };
  return data.id;
}
