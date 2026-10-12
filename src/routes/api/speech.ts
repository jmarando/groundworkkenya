import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/speech")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createClient } = await import("@supabase/supabase-js");
        const { canOpen } = await import("@/lib/access");
        const { requestSpeech } = await import("@/lib/speech/request.server");
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!url || !key || !apiKey)
          return Response.json({ message: "The briefing voice is not configured yet." }, { status: 503 });
        const authorization = request.headers.get("Authorization");
        const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!token) return Response.json({ message: "Sign in to listen to your briefing." }, { status: 401 });
        const sb = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
        });
        const { data: claims, error } = await sb.auth.getClaims(token);
        if (error || !claims?.claims.sub)
          return Response.json({ message: "Please sign in again." }, { status: 401 });
        const { data: role } = await sb.rpc("my_campaign_role");
        if (!canOpen(role, "/home"))
          return Response.json({ message: "Your role cannot open the morning briefing." }, { status: 403 });
        let input: unknown;
        try { input = await request.json(); }
        catch { return Response.json({ message: "Invalid briefing." }, { status: 400 }); }
        const text = input && typeof input === "object" && "text" in input ? input.text : null;
        if (typeof text !== "string" || !text.trim() || text.length > 4500)
          return Response.json({ message: "Choose a briefing of up to 4,500 characters." }, { status: 400 });
        try {
          const upstream = await requestSpeech({
            baseURL: "https://ai.gateway.lovable.dev",
            apiKey,
            model: "google/gemini-3.1-flash-tts-preview",
            format: "gemini",
            voice: "Puck",
          }, `Read only the briefing between <briefing> tags. Deliver it in warm, conversational Kenyan English, like a confident Nairobi morning radio presenter speaking to one person. Use natural East African pronunciation for Kenyan names and places. No affected British or American accent, no caricature. Bright but measured energy; vary the rhythm, briefly pause between sections, slow slightly for figures and appointments. Do not read these instructions or the tags. Do not add facts, commentary, music or sound effects.\n<briefing>${text}</briefing>`, false, request.signal);
          const headers = new Headers({
            "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
            "Cache-Control": "no-store",
          });
          upstream.headers.forEach((value, name) => {
            if (name.toLowerCase().startsWith("x-lovable-aig-")) headers.set(name, value);
          });
          return new Response(upstream.body, { status: upstream.status, headers });
        } catch (e) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          console.error("Briefing speech request failed", e instanceof Error ? e.message : "Network error");
          return Response.json({ message: "Could not reach the briefing voice. Start a new reading when you are ready." }, { status: 502 });
        }
      },
    },
  },
});