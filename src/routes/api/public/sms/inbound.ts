// Inbound SMS from Africa's Talking.
//
// Configure the callback as
//   https://<host>/api/public/sms/inbound?token=<AT_CALLBACK_TOKEN>
// Without AT_CALLBACK_TOKEN set, the endpoint refuses everything rather than
// accept unauthenticated writes to the voter file.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sms/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { atCallbackAllowed, readForm } = await import("@/lib/webhook-token.server");
        if (!process.env["AT_CALLBACK_TOKEN"])
          return new Response("Not configured", { status: 503 });
        if (!atCallbackAllowed(request)) return new Response("Unauthorized", { status: 401 });

        const body = await readForm(request);
        const from = body["from"] ?? "";
        if (!from) return new Response("Bad payload", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleInboundSms } = await import("@/lib/inbound.server");
        const route = await handleInboundSms(supabaseAdmin, from, body["text"] ?? "");

        // Any non-2xx makes Africa's Talking retry, which would record an
        // answer twice. Everything understood gets a 200.
        return Response.json({ ok: true, route });
      },
    },
  },
});
