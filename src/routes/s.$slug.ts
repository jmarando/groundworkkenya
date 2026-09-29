// A campaign's public website: groundwork.ke/s/<slug>
//
// GET draws the published site; POST is its volunteer form. The page is plain
// HTML with no JavaScript (see src/lib/site/render.ts). The form is the one
// place on it where a stranger can write to the campaign's records, so it has
// the poll page's protections: a trap field and a minimum fill time for naive
// bots, a limit per connection, and consent only when the phone replies
// START.

import { createFileRoute } from "@tanstack/react-router";

import { JOIN_ERRORS, parseJoin } from "@/lib/site/join";
import {
  htmlResponse,
  loadPublishedSite,
  mediaBase,
  notFound,
  siteBaseUrl,
  siteLang,
  type PublishedSite,
} from "@/lib/site/public.server";
import { renderSite, type JoinState } from "@/lib/site/render";

function draw(request: Request, site: PublishedSite, join?: JoinState, status = 200) {
  return htmlResponse(
    renderSite({
      campaign: site.campaign,
      content: site.content,
      lang: siteLang(request, site.content),
      wards: site.wards,
      mediaBase: mediaBase(),
      baseUrl: siteBaseUrl(request),
      ...(join ? { join } : {}),
    }),
    { status, cache: !join },
  );
}

const empty = { name: "", phone: "", ward: "", helps: [] };
const firstName = (name: string) => name.trim().split(/\s+/)[0]?.slice(0, 30) || "";

export const Route = createFileRoute("/s/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const site = await loadPublishedSite(params.slug);
        return site ? draw(request, site) : notFound();
      },

      POST: async ({ request, params }) => {
        const site = await loadPublishedSite(params.slug);
        if (!site) return notFound();
        if (!site.content.volunteer.on) return draw(request, site);

        const fields = await request.formData().catch(() => null);
        if (!fields) {
          return draw(request, site, {
            state: "error",
            message: JOIN_ERRORS.failed,
            values: empty,
          });
        }

        const parsed = parseJoin(fields, site.wards, Date.now());
        // Bots are thanked and nothing is recorded.
        if (parsed.kind === "bot") {
          return draw(request, site, {
            state: "done",
            name: firstName(String(fields.get("name") ?? "")),
          });
        }
        if (parsed.kind === "error") {
          return draw(request, site, {
            state: "error",
            message: parsed.message,
            values: parsed.values,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // A person signs up once; a script signs up hundreds of numbers. Sixty
        // in ten minutes from one connection leaves room for a crowd sharing
        // a carrier's address.
        const { visitorKey, withinLimit } = await import("@/lib/rate-limit.server");
        const visitor = visitorKey(request);
        if (visitor && !(await withinLimit(supabaseAdmin, `site-join:${visitor}`, 60, 600))) {
          return draw(
            request,
            site,
            { state: "error", message: JOIN_ERRORS.busy, values: parsed.values },
            429,
          );
        }

        const { recordVolunteer } = await import("@/lib/site/join.server");
        const { settleIfDryRun } = await import("@/lib/outbox.server");
        const label = site.campaign.candidate?.trim() || site.campaign.name;
        const recorded = await recordVolunteer(
          supabaseAdmin,
          { campaignId: site.campaign.id, label },
          parsed.values,
        );
        await settleIfDryRun(supabaseAdmin);
        if (!recorded) {
          return draw(request, site, {
            state: "error",
            message: JOIN_ERRORS.failed,
            values: parsed.values,
          });
        }
        return draw(request, site, { state: "done", name: firstName(parsed.values.name) });
      },
    },
  },
});
