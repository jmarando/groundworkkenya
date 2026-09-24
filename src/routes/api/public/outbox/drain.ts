// Drains the outbox. Called on a schedule with the shared cron secret, the
// same way the listening sweep is.
//
// In dry run the console already settles messages as they are written, so
// this only matters once channels go live: then it is what sends, and it must
// be scheduled (every minute is sensible) before CHANNELS_LIVE is switched on.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/outbox/drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches } = await import("@/lib/webhook-token.server");
        const sent = request.headers.get("x-cron-secret");
        const allowed = [
          process.env["OUTBOX_CRON_TOKEN"],
          process.env["LISTENING_CRON_TOKEN"],
          process.env["LOVABLE_CRON_SECRET"],
        ].some((secret) => tokenMatches(sent, secret));
        if (!allowed) return Response.json({ error: "unauthorized" }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processOutbox } = await import("@/lib/outbox.server");
        return Response.json(await processOutbox(supabaseAdmin, 500));
      },
    },
  },
});
