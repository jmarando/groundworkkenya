// Incoming calls to the Twilio number. Set as the number's "A call comes in"
// webhook: https://groundwork.ke/api/public/twilio/voice?token=<TWILIO_CALLBACK_TOKEN>
//
// Greets the caller, then rings TWILIO_VOICE_FORWARD_TO (the campaign office)
// if set. If nobody answers, or no number is set, the caller leaves a
// voicemail, which lands in the Inbox as a text conversation.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twilio/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches, readForm } = await import("@/lib/webhook-token.server");
        const { twiml, callbackUrl, escapeXml } = await import("@/lib/twilio.server");
        if (!process.env["TWILIO_CALLBACK_TOKEN"]) return new Response("Not configured", { status: 503 });
        const url = new URL(request.url);
        if (!tokenMatches(url.searchParams.get("token"), process.env["TWILIO_CALLBACK_TOKEN"]))
          return new Response("Unauthorized", { status: 401 });

        const body = await readForm(request);
        const step = url.searchParams.get("step");
        const voicemail = escapeXml(callbackUrl("/api/public/twilio/voicemail"));
        const record =
          `<Say>Please leave a message after the tone. Tafadhali acha ujumbe.</Say>` +
          `<Record maxLength="120" playBeep="true" recordingStatusCallback="${voicemail}" recordingStatusCallbackMethod="POST"/>`;

        if (step === "after") {
          const s = (body["DialCallStatus"] ?? "").toLowerCase();
          return twiml(s === "completed" ? "<Hangup/>" : record);
        }

        const forward = process.env["TWILIO_VOICE_FORWARD_TO"]?.trim();
        const greeting = "<Say>Thank you for calling the campaign. Asante kwa kupiga simu.</Say>";
        if (!forward) return twiml(greeting + record);
        const after = escapeXml(`${callbackUrl("/api/public/twilio/voice")}&step=after`);
        return twiml(
          greeting +
            `<Dial timeout="25" action="${after}" method="POST"><Number>${escapeXml(forward)}</Number></Dial>`,
        );
      },
    },
  },
});
