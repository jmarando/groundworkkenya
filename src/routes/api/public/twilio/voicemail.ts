// A finished voicemail: logged in the Inbox under the caller's number.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twilio/voicemail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches, readForm } = await import("@/lib/webhook-token.server");
        if (!process.env["TWILIO_CALLBACK_TOKEN"]) return new Response("Not configured", { status: 503 });
        if (!tokenMatches(new URL(request.url).searchParams.get("token"), process.env["TWILIO_CALLBACK_TOKEN"]))
          return new Response("Unauthorized", { status: 401 });

        const body = await readForm(request);
        const recording = body["RecordingUrl"];
        const callSid = body["CallSid"];
        if (!recording || !callSid || body["RecordingStatus"] !== "completed") return Response.json({ ok: true });

        // The recording callback doesn't say who called; ask Twilio for the call.
        const res = await fetch(`https://connector-gateway.lovable.dev/twilio/Calls/${encodeURIComponent(callSid)}.json`, {
          headers: {
            Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
            "X-Connection-Api-Key": process.env["TWILIO_API_KEY"] ?? "",
          },
        });
        const call = (await res.json().catch(() => null)) as { from?: string; to?: string } | null;
        if (!res.ok || !call?.from) {
          console.error(`Could not look up voicemail call [${res.status}]`);
          return Response.json({ ok: true });
        }
        const secs = body["RecordingDuration"] ?? "?";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleInboundSms } = await import("@/lib/inbound.server");
        await handleInboundSms(
          supabaseAdmin,
          call.from,
          `Voicemail (${secs}s), listen in Twilio: ${recording}.mp3`,
          call.to,
        );
        return Response.json({ ok: true });
      },
    },
  },
});
