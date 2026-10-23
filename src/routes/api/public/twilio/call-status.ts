// Twilio's reports on a call Groundwork placed (voice_calls, schema 42): its status as it rings,
// is answered and ends, who or what answered, how long, and why it failed. ?leg=voter is the
// Inbox call's second leg, reported when the voter's phone stops ringing; it answers with TwiML.
// Checked with TWILIO_CALLBACK_TOKEN; the call is found by its id in the address.

import { createFileRoute } from "@tanstack/react-router";

const STATUSES = new Set([
  "queued",
  "initiated",
  "ringing",
  "in-progress",
  "answered",
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);

export const Route = createFileRoute("/api/public/twilio/call-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { tokenMatches, readForm } = await import("@/lib/webhook-token.server");
        const { twiml } = await import("@/lib/twilio.server");
        if (!process.env["TWILIO_CALLBACK_TOKEN"]) return new Response("Not configured", { status: 503 });
        const url = new URL(request.url);
        if (!tokenMatches(url.searchParams.get("token"), process.env["TWILIO_CALLBACK_TOKEN"]))
          return new Response("Unauthorized", { status: 401 });
        const id = url.searchParams.get("call") ?? "";
        const voterLeg = url.searchParams.get("leg") === "voter";
        const body = await readForm(request);
        if (!/^[0-9a-f-]{36}$/.test(id)) return voterLeg ? twiml("<Hangup/>") : Response.json({ ok: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // The service role, loosely typed: schema 42's tables are newer than the generated types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabaseAdmin as unknown as { from: (table: string) => any };
        const now = new Date().toISOString();
        if (voterLeg) {
          const s = (body["DialCallStatus"] ?? "").toLowerCase();
          const d = Number(body["DialCallDuration"]);
          await sb
            .from("voice_calls")
            .update({
              voter_status: STATUSES.has(s) ? s : "failed",
              ...(Number.isFinite(d) && d >= 0 ? { duration: Math.round(d) } : {}),
              updated_at: now,
            })
            .eq("id", id);
          return twiml("<Hangup/>");
        }

        const s = (body["CallStatus"] ?? "").toLowerCase();
        const d = Number(body["CallDuration"]);
        const code = body["ErrorCode"] ?? "";
        const patch: Record<string, unknown> = { updated_at: now };
        if (STATUSES.has(s)) patch["status"] = s;
        if (body["CallSid"]) patch["sid"] = body["CallSid"];
        if (body["AnsweredBy"]) patch["answered_by"] = body["AnsweredBy"].slice(0, 40);
        if (Number.isFinite(d) && d >= 0 && s === "completed") patch["duration"] = Math.round(d);
        if (code) patch["error"] = `Twilio ${code}`;
        const { data: row } = await sb
          .from("voice_calls")
          .select("kind, duration")
          .eq("id", id)
          .maybeSingle();
        // An Inbox call's length is the voter's leg, reported on its own; keep that one.
        if ((row as { kind?: string; duration?: number | null } | null)?.kind === "bridge")
          delete patch["duration"];
        await sb.from("voice_calls").update(patch).eq("id", id);
        return Response.json({ ok: true });
      },
    },
  },
});
