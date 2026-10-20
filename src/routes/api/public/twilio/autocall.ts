// What an auto-call plays when it is answered (voice_calls and voice_blasts, schema 42): the
// recorded message (the candidate's voice, a recording, or a standard voice reading the script),
// then "press 9 to stop these calls". ?step=key is the key pressed: 9 withdraws the person's
// consent to calls. Checked with TWILIO_CALLBACK_TOKEN; the call is found by its id.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/twilio/autocall")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches, readForm } = await import("@/lib/webhook-token.server");
        const { twiml, escapeXml, callbackWith } = await import("@/lib/twilio.server");
        const { autocallTwiml } = await import("@/lib/autocall");
        if (!process.env["TWILIO_CALLBACK_TOKEN"]) return new Response("Not configured", { status: 503 });
        const url = new URL(request.url);
        if (!tokenMatches(url.searchParams.get("token"), process.env["TWILIO_CALLBACK_TOKEN"]))
          return new Response("Unauthorized", { status: 401 });
        const id = url.searchParams.get("call") ?? "";
        if (!/^[0-9a-f-]{36}$/.test(id)) return twiml("<Hangup/>");
        const body = await readForm(request);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // The service role, loosely typed: schema 42's tables are newer than the generated types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabaseAdmin as unknown as { from: (table: string) => any };

        const { data: call } = (await sb
          .from("voice_calls")
          .select("id, kind, person_id, blast_id, campaign_id")
          .eq("id", id)
          .maybeSingle()) as {
          data: { id: string; kind: string; person_id: string | null; blast_id: string | null; campaign_id: string } | null;
        };
        if (!call?.blast_id) return twiml("<Hangup/>");

        if (url.searchParams.get("step") === "key") {
          const digit = (body["Digits"] ?? "").slice(0, 1);
          await sb
            .from("voice_calls")
            .update({ digits: digit || null, updated_at: new Date().toISOString() })
            .eq("id", id);
          if (digit === "9" && call.person_id)
            await sb
              .from("people")
              .update({ consent_call: false })
              .eq("id", call.person_id)
              .eq("campaign_id", call.campaign_id);
          return twiml(
            digit === "9"
              ? "<Say>You will not get these calls again. Goodbye. Hautapigiwa tena. Kwaheri.</Say><Hangup/>"
              : "<Say>Thank you. Asante.</Say><Hangup/>",
          );
        }

        const { data: blast } = (await sb
          .from("voice_blasts")
          .select("script, language, source, audio_url, disclose, campaign_id")
          .eq("id", call.blast_id)
          .maybeSingle()) as {
          data: {
            script: string;
            language: "en" | "sw";
            source: "clone" | "upload" | "standard";
            audio_url: string | null;
            disclose: boolean;
            campaign_id: string;
          } | null;
        };
        if (!blast) return twiml("<Hangup/>");
        const { data: campaign } = await sb
          .from("campaigns")
          .select("name, candidate")
          .eq("id", blast.campaign_id)
          .maybeSingle();
        return twiml(
          autocallTwiml({
            blast,
            who: campaign?.candidate || campaign?.name || "the campaign",
            keyUrl: callbackWith("/api/public/twilio/autocall", { call: id, step: "key" }),
            escape: escapeXml,
          }),
        );
      },
    },
  },
});
