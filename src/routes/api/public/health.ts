// Deploy check: which database schema is the app talking to?
//
// Reports a version number and nothing else — no counts, no campaign data —
// so it is safe to leave public. 0 means the Groundwork migrations have not
// been applied; 2 means the access fix and the poll engine are both in.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const headers = { "Cache-Control": "no-store" };
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("groundwork_schema_version");
          return Response.json(
            { ok: true, schemaVersion: error ? 0 : Number(data ?? 0) },
            { headers },
          );
        } catch {
          // The server cannot reach the database with its own credentials.
          return Response.json({ ok: false, schemaVersion: null }, { status: 503, headers });
        }
      },
    },
  },
});
