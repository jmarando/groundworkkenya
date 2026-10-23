// M-Pesa couldn't process a stipend payout in time (Daraja B2C QueueTimeOutURL):
// https://groundwork.ke/api/public/mpesa/b2c-timeout?token=<MPESA_CALLBACK_TOKEN>
// The money may or may not have gone, so the stipend stays in flight with a note to check the
// M-Pesa statement; nothing pays it again until someone has.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mpesa/b2c-timeout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches } = await import("@/lib/webhook-token.server");
        if (!process.env["MPESA_CALLBACK_TOKEN"])
          return new Response("Not configured", { status: 503 });
        if (
          !tokenMatches(
            new URL(request.url).searchParams.get("token"),
            process.env["MPESA_CALLBACK_TOKEN"],
          )
        )
          return new Response("Unauthorized", { status: 401 });
        const body = (await request.json().catch(() => null)) as {
          Result?: { OriginatorConversationID?: unknown };
        } | null;
        const req = body?.Result?.OriginatorConversationID;
        if (typeof req === "string" && /^GW-[0-9a-f]{32}$/.test(req)) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await (
            supabaseAdmin as unknown as {
              rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<unknown>;
            }
          ).rpc("stipend_payment_unclear", {
            _request: req,
            _note: "M-Pesa timed out. Check the statement before paying again.",
          });
        }
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
