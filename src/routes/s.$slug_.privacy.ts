// The privacy notice for a campaign's website: groundwork.ke/s/<slug>/privacy
// Written from what the site collects; shown only while the site is published.

import { createFileRoute } from "@tanstack/react-router";

import {
  htmlResponse,
  loadPublishedSite,
  notFound,
  siteBaseUrl,
  siteLang,
} from "@/lib/site/public.server";
import { renderPrivacy } from "@/lib/site/render";

export const Route = createFileRoute("/s/$slug_/privacy")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const site = await loadPublishedSite(params.slug);
        if (!site) return notFound();
        return htmlResponse(
          renderPrivacy({
            campaign: site.campaign,
            content: site.content,
            lang: siteLang(request, site.content),
            baseUrl: siteBaseUrl(request),
          }),
          { cache: true },
        );
      },
    },
  },
});
