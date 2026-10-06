// Delivery reports for texts sent through Twilio (set per message by the outbox).

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twilio/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches, readForm } = await import("@/lib/webhook-token.server");
        if (!process.env["TWILIO_CALLBACK_TOKEN"]) return new Response("Not configured", { status: 503 });
        const token = new URL(request.url).searchParams.get("token");
        if (!tokenMatches(token, process.env["TWILIO_CALLBACK_TOKEN"]))
          return new Response("Unauthorized", { status: 401 });

        const body = await readForm(request);
        const ref = body["MessageSid"] ?? "";
        const status = (body["MessageStatus"] ?? "").toLowerCase();
        if (!ref || !status) return Response.json({ ok: true });

        const patch =
          status === "delivered"
            ? { status: "delivered", delivered_at: new Date().toISOString() }
            : status === "failed" || status === "undelivered"
              ? { status: "failed", error: `Delivery ${status}: Twilio ${body["ErrorCode"] ?? ""}`.trim() }
              : null;
        if (patch) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("messages").update(patch).eq("provider_ref", ref);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
