// M-Pesa's answer to a stipend payout (Daraja B2C ResultURL):
// https://groundwork.ke/api/public/mpesa/b2c-result?token=<MPESA_CALLBACK_TOKEN>
// Paid with its receipt, or back to approved with the reason. M-Pesa wants a 200 either way.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mpesa/b2c-result")({
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
        const { readB2CResult } = await import("@/lib/mpesa");
        const result = readB2CResult(await request.json().catch(() => null));
        if (result) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await (
            supabaseAdmin as unknown as {
              rpc: (
                fn: string,
                args: Record<string, unknown>,
              ) => PromiseLike<{ error: { message: string } | null }>;
            }
          ).rpc("finish_stipend_payment", {
            _request: result.request,
            _ok: result.ok,
            _receipt: result.ok ? result.receipt : null,
            _error: result.ok ? null : result.error,
          });
          if (error) console.error("Recording an M-Pesa result failed", error.message);
        }
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
