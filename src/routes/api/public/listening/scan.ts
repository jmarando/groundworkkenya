import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { runListeningScan } from "@/lib/listening.server";

/**
 * Hourly listening sweep. Called by the scheduler with the shared cron secret.
 * Bounded per run, single-flight via the listening_jobs lease, and pauses
 * itself if the search or AI service refuses work.
 */
export const Route = createFileRoute("/api/public/listening/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const sent = request.headers.get("x-cron-secret");
        if (!secret || sent !== secret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const sb = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );

        const result = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
        return Response.json(result);
      },
    },
  },
});
