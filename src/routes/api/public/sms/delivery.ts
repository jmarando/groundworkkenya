// Delivery reports from Africa's Talking.
//
// Configure the callback as
//   https://<host>/api/public/sms/delivery?token=<AT_CALLBACK_TOKEN>
// Each report carries the provider message id and a status; we match it back
// to the outbox row and record delivery or failure. Always 200 once
// authenticated so Africa's Talking does not retry a report we understood.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sms/delivery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { atCallbackAllowed, readForm } = await import("@/lib/webhook-token.server");
        if (!process.env["AT_CALLBACK_TOKEN"])
          return new Response("Not configured", { status: 503 });
        if (!atCallbackAllowed(request)) return new Response("Unauthorized", { status: 401 });

        const body = await readForm(request);
        const ref = body["id"] ?? "";
        const status = (body["status"] ?? "").toLowerCase();
        if (!ref || !status) return Response.json({ ok: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const done = status === "success" || status === "delivered";
        const rejected = status === "failed" || status === "rejected";
        const patch = done
          ? { status: "delivered", delivered_at: new Date().toISOString() }
          : rejected
            ? { status: "failed", error: `Delivery ${status}: ${body["failureReason"] ?? ""}`.trim() }
            : null;
        if (patch) {
          await supabaseAdmin.from("messages").update(patch).eq("provider_ref", ref);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
