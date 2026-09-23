// USSD sessions from Africa's Talking.
//
// Configure the callback as
//   https://<host>/api/public/ussd?token=<AT_CALLBACK_TOKEN>
// Each request carries the caller's whole path so far in `text` ("1*3"); the
// reply is plain text starting "CON" (keep the session open) or "END".

import { createFileRoute } from "@tanstack/react-router";

const plain = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const Route = createFileRoute("/api/public/ussd")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { atCallbackAllowed, readForm } = await import("@/lib/webhook-token.server");
        if (!process.env["AT_CALLBACK_TOKEN"]) return plain("END Huduma haipatikani.", 503);
        if (!atCallbackAllowed(request)) return plain("END Unauthorized", 401);

        const body = await readForm(request);
        const phone = body["phoneNumber"] ?? "";
        if (!phone) return plain("END Samahani, jaribu tena.", 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleUssd } = await import("@/lib/inbound.server");
        try {
          return plain(await handleUssd(supabaseAdmin, phone, (body["text"] ?? "").slice(0, 200)));
        } catch {
          // A stack trace is no use on a feature phone screen.
          return plain("END Samahani, kuna tatizo. Jaribu tena baadaye.");
        }
      },
    },
  },
});
