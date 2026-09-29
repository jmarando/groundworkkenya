// The Website screen. Reads run as the signed-in person, under row level
// security; every change goes through the database functions of the campaign
// websites migration, which check the role and keep the version history.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { cleanContent, starterContent, type SiteContent } from "@/lib/site/content";
import type { SiteCampaign } from "@/lib/site/render";

export type SiteVersion = { id: string; publishedAt: string; by: string | null };

export type SiteData = {
  campaign: SiteCampaign;
  /** Candidate, campaign manager or super admin. */
  canEdit: boolean;
  draft: SiteContent;
  rev: number;
  savedAt: string | null;
  /** The public can see it now. */
  live: boolean;
  publishedAt: string | null;
  /** The draft differs from what the public sees. */
  changed: boolean;
  versions: SiteVersion[];
  wards: { id: string; name: string }[];
};

export const getSite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteData> => {
    const sb = context.supabase;
    const [{ data: campaignId }, { data: role }] = await Promise.all([
      sb.rpc("my_campaign"),
      sb.rpc("my_campaign_role"),
    ]);
    if (!campaignId) throw new Error("Open a campaign first.");

    const [campaign, site, versions, wards] = await Promise.all([
      sb
        .from("campaigns")
        .select("id, slug, name, candidate, seat")
        .eq("id", campaignId)
        .maybeSingle(),
      sb
        .from("campaign_sites")
        .select("draft, draft_rev, published, published_at, updated_at")
        .eq("campaign_id", campaignId)
        .maybeSingle(),
      sb
        .from("site_versions")
        .select("id, published_at, published_by")
        .eq("campaign_id", campaignId)
        .order("published_at", { ascending: false })
        .limit(20),
      sb.from("wards").select("id, name").eq("campaign_id", campaignId).order("name").limit(151),
    ]);
    if (!campaign.data) throw new Error("Could not load your campaign.");
    if (site.error || versions.error) throw new Error("Could not load the website.");

    const by = [...new Set((versions.data ?? []).map((v) => v.published_by).filter(Boolean))];
    const { data: profiles } = by.length
      ? await sb
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", by as string[])
      : { data: [] };
    const nameOf = new Map(
      (profiles ?? []).map((p) => [p.user_id, p.full_name?.trim() || p.email || null]),
    );

    const c = campaign.data;
    const s = site.data;
    const draft = s ? cleanContent(s.draft, c.id) : starterContent(c);
    const published = s?.published ? cleanContent(s.published, c.id) : null;
    return {
      campaign: c,
      canEdit: ["candidate", "manager", "super"].includes(String(role)),
      draft,
      rev: s?.draft_rev ?? 0,
      savedAt: s?.updated_at ?? null,
      live: Boolean(published),
      publishedAt: s?.published_at ?? null,
      changed: !published || JSON.stringify(published) !== JSON.stringify(draft),
      versions: (versions.data ?? []).map((v) => ({
        id: v.id,
        publishedAt: v.published_at,
        by: (v.published_by && nameOf.get(v.published_by)) || null,
      })),
      wards: wards.data && wards.data.length <= 150 ? wards.data : [],
    };
  });

export type SaveResult = { ok: true; rev: number; savedAt: string } | { ok: false; conflict: true };

export const saveSiteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { content: unknown; rev: number }) => {
    const rev = Number(input?.rev);
    if (!Number.isInteger(rev) || rev < 0) throw new Error("Reload the page and try again.");
    return { content: input?.content, rev };
  })
  .handler(async ({ data, context }): Promise<SaveResult> => {
    const sb = context.supabase;
    const { data: campaignId } = await sb.rpc("my_campaign");
    if (!campaignId) throw new Error("Open a campaign first.");
    const content = cleanContent(data.content, campaignId);
    const { data: rev, error } = await sb.rpc("save_site_draft", {
      _draft: content as unknown as Json,
      _rev: data.rev,
    });
    if (error?.code === "40001") return { ok: false, conflict: true };
    if (error) throw new Error(error.message);
    return { ok: true, rev: rev as number, savedAt: new Date().toISOString() };
  });

export const publishSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("publish_site");
    if (error) throw new Error(error.message);
    return { publishedAt: data as string };
  });

export const unpublishSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("unpublish_site");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreSiteVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(input?.id ?? ""))) throw new Error("Pick a version.");
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<{ rev: number; draft: SiteContent }> => {
    const sb = context.supabase;
    const { data: rev, error } = await sb.rpc("restore_site_version", { _version: data.id });
    if (error) throw new Error(error.message);
    const { data: campaignId } = await sb.rpc("my_campaign");
    const { data: site } = await sb
      .from("campaign_sites")
      .select("draft")
      .eq("campaign_id", campaignId ?? "")
      .maybeSingle();
    return { rev: rev as number, draft: cleanContent(site?.draft, campaignId ?? "") };
  });

/**
 * Save a photo for the site. The server checks the caller may change the
 * website, checks the file, and chooses where it goes: the campaign's own
 * folder under a random name. Storage takes it with the service role, so no
 * browser writes to the bucket directly.
 */
export const uploadSitePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { photo: string }) => ({ photo: String(input?.photo ?? "") }))
  .handler(async ({ data, context }): Promise<{ path: string }> => {
    const sb = context.supabase;
    const [{ data: campaignId }, { data: role }] = await Promise.all([
      sb.rpc("my_campaign"),
      sb.rpc("my_campaign_role"),
    ]);
    if (!campaignId || !["candidate", "manager", "super"].includes(String(role))) {
      throw new Error("Only the candidate or campaign manager can add photos.");
    }
    const { decodeSitePhoto } = await import("@/lib/site/photo");
    const bytes = decodeSitePhoto(data.photo);
    const path = `${campaignId}/${crypto.randomUUID()}.jpg`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("site-media").upload(path, bytes, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error("Could not save the picture. Try again.");
    return { path };
  });
