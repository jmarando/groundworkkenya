// The diary as a calendar to subscribe to: https://groundwork.ke/api/public/calendar/<token>.ics
// The token is the person's private link (Diary, "Add to your calendar"); the database shows the
// campaign's entries only while that person is still on its office.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").replace(/\.ics$/, "");
        if (!/^[0-9a-f]{64}$/.test(token)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (
          supabaseAdmin as unknown as {
            rpc: (
              fn: string,
              args: Record<string, unknown>,
            ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
          }
        ).rpc("calendar_feed_entries", { _token: token });
        if (error) {
          console.error("Reading a diary feed failed", error.message);
          return new Response("Try again later", { status: 503 });
        }
        const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
        const text = (v: unknown) => (typeof v === "string" ? v : null);
        const { diaryCalendar } = await import("@/lib/calendar");
        const body = diaryCalendar(
          text(rows[0]?.["campaign"]) ?? "Groundwork",
          rows.map((r) => ({
            id: String(r["id"]),
            day: String(r["day"]),
            startsAt: text(r["starts_at"]),
            title: text(r["title"]) ?? "Diary",
            kind: text(r["kind"]),
            note: text(r["note"]),
            wardName: text(r["ward_name"]),
            updatedAt: text(r["updated_at"]),
          })),
        );
        return new Response(body, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'inline; filename="diary.ics"',
            "Cache-Control": "private, max-age=900",
          },
        });
      },
    },
  },
});
