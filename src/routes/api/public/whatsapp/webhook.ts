// WhatsApp deliveries from the Lovable connector (messages and delivery
// statuses for +254 182 668723). Path is a contract: do not move it.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const { verifyWebhookRequest } = await import("@lovable.dev/webhooks-js");
        let payload: unknown;
        try {
          ({ payload } = await verifyWebhookRequest({
            req: request,
            secret,
            maxBodyBytes: 4 * 1024 * 1024,
          }));
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }

        const deliveryId = request.headers.get("x-lovable-delivery");
        const event = request.headers.get("x-lovable-event");
        if (!deliveryId || !event) return new Response("Missing headers", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processEventRow, recoverPending } = await import("@/lib/whatsapp.server");

        const { error: insErr } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .upsert(
            { delivery_id: deliveryId, event, payload: payload as never },
            { onConflict: "delivery_id", ignoreDuplicates: true },
          );
        if (insErr) return new Response("Store failed", { status: 500 });

        const { data: row, error } = await supabaseAdmin
          .from("whatsapp_webhook_events")
          .select("id, event, payload, attempts, processed_at")
          .eq("delivery_id", deliveryId)
          .single();
        if (error || !row) return new Response("Store failed", { status: 500 });

        if (!row.processed_at) {
          const ok = await processEventRow(supabaseAdmin, row);
          if (!ok) return new Response("Processing failed", { status: 500 });
        }
        // Stored durably; anything still waiting is retried on later calls.
        await recoverPending(supabaseAdmin, row.id).catch(() => {});
        return new Response("ok");
      },
    },
  },
});
