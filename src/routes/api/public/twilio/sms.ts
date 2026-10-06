// Incoming texts to the Twilio number. Set as the number's "A message comes in"
// webhook: https://groundwork.ke/api/public/twilio/sms?token=<TWILIO_CALLBACK_TOKEN>

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twilio/sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches, readForm } = await import("@/lib/webhook-token.server");
        const { twiml } = await import("@/lib/twilio.server");
        if (!process.env["TWILIO_CALLBACK_TOKEN"]) return new Response("Not configured", { status: 503 });
        const token = new URL(request.url).searchParams.get("token");
        if (!tokenMatches(token, process.env["TWILIO_CALLBACK_TOKEN"]))
          return new Response("Unauthorized", { status: 401 });

        const body = await readForm(request);
        const from = body["From"] ?? "";
        if (!from) return twiml("");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleInboundSms } = await import("@/lib/inbound.server");
        await handleInboundSms(supabaseAdmin, from, body["Body"] ?? "", body["To"]);
        // Replies go out through the outbox, so answer Twilio with nothing.
        return twiml("");
      },
    },
  },
});
