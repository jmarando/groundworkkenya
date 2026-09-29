// Serving a campaign's published website: finding it by slug, and the
// headers every page of it goes out with.

import { cleanContent, type Lang, type SiteContent } from "@/lib/site/content";
import type { SiteCampaign } from "@/lib/site/render";

const SLUG = /^[a-z0-9-]{2,40}$/;

/** A ward list longer than this is too heavy a page for 2G: leave the question out. */
const MAX_WARDS = 150;

export type PublishedSite = {
  campaign: SiteCampaign;
  content: SiteContent;
  wards: { id: string; name: string }[];
};

/** The campaign's published site, or null when there is none to show. */
export async function loadPublishedSite(slug: string): Promise<PublishedSite | null> {
  if (!SLUG.test(slug)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, slug, name, candidate, seat")
    .eq("slug", slug)
    .maybeSingle();
  if (!campaign) return null;

  const { data: site } = await supabaseAdmin
    .from("campaign_sites")
    .select("published")
    .eq("campaign_id", campaign.id)
    .maybeSingle();
  if (!site?.published) return null;
  const content = cleanContent(site.published, campaign.id);

  let wards: { id: string; name: string }[] = [];
  if (content.volunteer.on) {
    const { data } = await supabaseAdmin
      .from("wards")
      .select("id, name")
      .eq("campaign_id", campaign.id)
      .order("name")
      .limit(MAX_WARDS + 1);
    wards = data && data.length <= MAX_WARDS ? data : [];
  }
  return { campaign, content, wards };
}

/** ?lang=sw or ?lang=en, else the language the campaign chose. */
export function siteLang(request: Request, content: SiteContent): Lang {
  const asked = new URL(request.url).searchParams.get("lang");
  return asked === "sw" || asked === "en" ? asked : content.lang;
}

/** Share cards point at groundwork.ke even when the page came through a campaign's own address. */
export function siteBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return /(^|\.)groundwork\.ke$/.test(url.hostname) ? "https://groundwork.ke" : url.origin;
}

function storageOrigin(): string {
  const url = process.env["SUPABASE_URL"] ?? "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Where the site-media bucket's files are served from. */
export function mediaBase(): string {
  return `${storageOrigin()}/storage/v1/object/public/site-media/`;
}

export function htmlResponse(html: string, opts: { status?: number; cache?: boolean } = {}) {
  return new Response(html, {
    status: opts.status ?? 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": opts.cache ? "public, max-age=60" : "no-store",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' ${storageOrigin()}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function notFound(): Response {
  return htmlResponse(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Not found</title>
<style>body{margin:0;font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#141c19;background:#f5f5f0;padding:64px 20px}main{max-width:480px;margin:0 auto}h1{font-size:26px;margin:0 0 8px}p{color:#59625d}</style></head>
<body><main><h1>Ukurasa haupatikani</h1><p>There is no campaign website at this address.</p></main></body>
</html>`,
    { status: 404 },
  );
}
