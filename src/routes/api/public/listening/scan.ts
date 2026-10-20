import { createFileRoute } from "@tanstack/react-router";

import { runListeningScan } from "@/lib/listening.server";
import { runMorningStory } from "@/lib/morning-story.server";
import { runSearchInterest } from "@/lib/search-interest.server";
import { runRivalSweep } from "@/lib/race-sweep.server";
import { tokenMatches } from "@/lib/webhook-token.server";

/**
 * Hourly listening sweep. Called by the scheduler with the shared cron secret.
 * Bounded per run, single-flight via the listening_jobs lease, and pauses
 * itself if the search or AI service refuses work.
 */
export const Route = createFileRoute("/api/public/listening/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sent = request.headers.get("x-cron-secret");
        const allowed = [process.env["LISTENING_CRON_TOKEN"], process.env["LOVABLE_CRON_SECRET"]].some(
          (expected) => tokenMatches(sent, expected),
        );
        if (!allowed) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

        const result = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 }).catch((e: Error) => ({
          ran: false,
          error: e.message,
        }));
        // Always check the morning record, even when collection throws or pauses.
        // Do this before rival work so that unrelated provider failures cannot delay it.
        const story = await runMorningStory(sb as never).catch((e: Error) => ({
          ran: false,
          error: e.message,
        }));
        // Once a day the same call reads rivals' own posts (it keeps its own clock).
        const rivals = await runRivalSweep(sb as never).catch((e: Error) => ({
          ran: false,
          error: e.message,
        }));
        // And once a morning, each campaign's search interest.
        const search = await runSearchInterest(sb as never).catch((e: Error) => ({
          ran: false,
          error: e.message,
        }));
        // Yesterday's SMS charges onto the ledger, as each campaign's pending comms expense.
        const comms = await sb
          .rpc("comms_to_ledger")
          .then(({ data, error }) => (error ? { error: error.message } : { posted: data }));
        // Last, records past their keeping time (old webhook payloads, alert events, posts).
        const pruned = await sb
          .rpc("prune_old_records")
          .then(({ data, error }) => (error ? { error: error.message } : data));
        return Response.json({ ...result, rivals, story, search, comms, pruned });
      },
    },
  },
});
