// The name and seat shown on a campaign's own sign-in page. Public: nothing
// here is more than what the campaign's address already says.

import { createServerFn } from "@tanstack/react-start";

export type PublicCampaign = { name: string; seat: string; candidate: string | null };

export const getPublicCampaign = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => {
    if (!/^[a-z0-9-]{2,40}$/.test(input?.slug ?? "")) throw new Error("Unknown campaign.");
    return input;
  })
  .handler(async ({ data }): Promise<PublicCampaign | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin
      .from("campaigns")
      .select("name, seat, candidate")
      .eq("slug", data.slug)
      .maybeSingle();
    return c ?? null;
  });
