import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PLATFORMS = [
  { key: "facebook", label: "Facebook Page", code: "FB" },
  { key: "instagram", label: "Instagram", code: "IG" },
  { key: "x", label: "X", code: "X" },
  { key: "whatsapp", label: "WhatsApp Business", code: "WA" },
] as const;

export type SocialData = {
  accounts: {
    id: string;
    platform: string;
    handle: string;
    displayName: string | null;
    externalId: string | null;
    status: string;
    live: boolean;
    note: string | null;
    lastEventAt: string | null;
  }[];
  totals: {
    inbound: number;
    positive: number;
    neutral: number;
    negative: number;
    unanalysed: number;
    awaitingReply: number;
  };
  byPlatform: {
    platform: string;
    inbound: number;
    positive: number;
    neutral: number;
    negative: number;
    score: number;
  }[];
  byIssue: { issue: string; n: number; negative: number }[];
  byDay: { day: string; positive: number; neutral: number; negative: number }[];
  recent: {
    id: string;
    platform: string;
    kind: string;
    author: string | null;
    body: string;
    sentiment: string | null;
    issue: string | null;
    at: string;
    permalink: string | null;
    conversationId: string | null;
  }[];
  hot: {
    id: string;
    conversationId: string | null;
    platform: string;
    author: string | null;
    body: string;
    issue: string | null;
    at: string;
  }[];
};

const dayKey = (iso: string) => iso.slice(0, 10);

export const getSocial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SocialData> => {
    const sb = context.supabase;
    const socialPlatforms = PLATFORMS.map((p) => p.key);

    const [{ data: accounts }, { data: msgs }, { data: convos }] = await Promise.all([
      sb.from("social_accounts").select("*").order("platform"),
      sb
        .from("messages")
        .select(
          "id, platform, kind, direction, body, author_handle, sentiment, sentiment_score, issue, permalink, conversation_id, created_at",
        )
        .in("platform", socialPlatforms)
        .order("created_at", { ascending: false })
        .limit(1000),
      sb
        .from("conversations")
        .select("id, platform, status, unread, author_name, author_handle")
        .in("platform", socialPlatforms),
    ]);

    const rows = msgs ?? [];
    const inbound = rows.filter((m) => m.direction === "in");
    const convoById = new Map((convos ?? []).map((c) => [c.id, c]));

    const bucket = (s: string | null) =>
      s === "positive" ? "positive" : s === "negative" ? "negative" : s === "neutral" ? "neutral" : null;

    const byPlatform = socialPlatforms.map((platform) => {
      const list = inbound.filter((m) => m.platform === platform);
      const positive = list.filter((m) => bucket(m.sentiment) === "positive").length;
      const negative = list.filter((m) => bucket(m.sentiment) === "negative").length;
      const neutral = list.filter((m) => bucket(m.sentiment) === "neutral").length;
      const rated = positive + negative + neutral;
      return {
        platform,
        inbound: list.length,
        positive,
        neutral,
        negative,
        score: rated ? Math.round(((positive - negative) / rated) * 100) : 0,
      };
    });

    const issueMap = new Map<string, { n: number; negative: number }>();
    for (const m of inbound) {
      const key = m.issue ?? "unsorted";
      const cur = issueMap.get(key) ?? { n: 0, negative: 0 };
      cur.n += 1;
      if (bucket(m.sentiment) === "negative") cur.negative += 1;
      issueMap.set(key, cur);
    }

    const dayMap = new Map<string, { positive: number; neutral: number; negative: number }>();
    for (const m of inbound) {
      const d = dayKey(m.created_at as string);
      const cur = dayMap.get(d) ?? { positive: 0, neutral: 0, negative: 0 };
      const b = bucket(m.sentiment);
      if (b) cur[b] += 1;
      dayMap.set(d, cur);
    }

    const recent = inbound.slice(0, 60).map((m) => ({
      id: m.id,
      platform: m.platform,
      kind: m.kind,
      author:
        m.author_handle ??
        (m.conversation_id ? (convoById.get(m.conversation_id)?.author_name ?? null) : null),
      body: m.body,
      sentiment: m.sentiment,
      issue: m.issue,
      at: m.created_at as string,
      permalink: m.permalink,
      conversationId: m.conversation_id,
    }));

    const repliedThreads = new Set(
      rows.filter((m) => m.direction === "out" && m.conversation_id).map((m) => m.conversation_id!),
    );

    const hot = inbound
      .filter((m) => bucket(m.sentiment) === "negative")
      .filter((m) => !m.conversation_id || !repliedThreads.has(m.conversation_id))
      .slice(0, 12)
      .map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        platform: m.platform,
        author:
          m.author_handle ??
          (m.conversation_id ? (convoById.get(m.conversation_id)?.author_name ?? null) : null),
        body: m.body,
        issue: m.issue,
        at: m.created_at as string,
      }));

    return {
      accounts: (accounts ?? []).map((a) => ({
        id: a.id,
        platform: a.platform,
        handle: a.handle,
        displayName: a.display_name,
        externalId: a.external_id,
        status: a.status,
        live: a.live,
        note: a.note,
        lastEventAt: a.last_event_at as string | null,
      })),
      totals: {
        inbound: inbound.length,
        positive: inbound.filter((m) => bucket(m.sentiment) === "positive").length,
        neutral: inbound.filter((m) => bucket(m.sentiment) === "neutral").length,
        negative: inbound.filter((m) => bucket(m.sentiment) === "negative").length,
        unanalysed: inbound.filter((m) => !bucket(m.sentiment)).length,
        awaitingReply: (convos ?? []).filter(
          (c) => c.status === "open" && !repliedThreads.has(c.id),
        ).length,
      },
      byPlatform,
      byIssue: [...issueMap.entries()]
        .map(([issue, v]) => ({ issue, n: v.n, negative: v.negative }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 12),
      byDay: [...dayMap.entries()]
        .map(([day, v]) => ({ day, ...v }))
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-14),
      recent,
      hot,
    };
  });

/* ------------------------------------------------------- sentiment analysis */

type Verdict = { id: string; sentiment: "positive" | "neutral" | "negative"; issue: string; score: number };

export const analyseSentiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(input?.limit ?? 40, 1), 80),
  }))
  .handler(async ({ data, context }): Promise<{ analysed: number; remaining: number; error?: string }> => {
    const sb = context.supabase;
    const { data: pending } = await sb
      .from("messages")
      .select("id, body, platform")
      .eq("direction", "in")
      .is("sentiment", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const rows = pending ?? [];
    if (rows.length === 0) return { analysed: 0, remaining: 0 };

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { analysed: 0, remaining: rows.length, error: "AI is not configured." };

    const prompt = [
      "You read messages sent to a Kenyan political campaign. They mix English, Kiswahili and Sheng.",
      "For each message return the mood (positive, neutral or negative towards the campaign),",
      "a short lowercase issue label (for example: roads, water, jobs, bursaries, security, rubbish collection,",
      "health centre, street lighting, rally, volunteering, general), and a score from -1 (furious) to 1 (delighted).",
      "Return one entry per message, keeping the given id.",
      "",
      JSON.stringify(rows.map((r) => ({ id: r.id, text: r.body.slice(0, 600) }))),
    ].join("\n");

    let verdicts: Verdict[] = [];
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          input: prompt,
          stream: true,
          reasoning: { effort: "low", summary: "auto" },
          include: ["reasoning.encrypted_content"],
          text: {
            format: {
              type: "json_schema",
              name: "sentiment_batch",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["results"],
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "sentiment", "issue", "score"],
                      properties: {
                        id: { type: "string" },
                        sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                        issue: { type: "string" },
                        score: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });

      if (!res.ok || !res.body) {
        const body = await res.text();
        return { analysed: 0, remaining: rows.length, error: `AI request failed (${res.status}): ${body.slice(0, 200)}` };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload) as { type?: string; delta?: string };
            if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
              text += evt.delta;
            }
          } catch {
            /* skip malformed frame */
          }
        }
      }

      const parsed = JSON.parse(text) as { results?: Verdict[] };
      verdicts = parsed.results ?? [];
    } catch (err) {
      return {
        analysed: 0,
        remaining: rows.length,
        error: err instanceof Error ? err.message : "Analysis failed.",
      };
    }

    const known = new Set(rows.map((r) => r.id));
    let analysed = 0;
    for (const v of verdicts) {
      if (!known.has(v.id)) continue;
      const score = Math.max(-1, Math.min(1, Number(v.score) || 0));
      const issue = (v.issue || "general").toLowerCase().slice(0, 40);
      const { error } = await sb
        .from("messages")
        .update({ sentiment: v.sentiment, sentiment_score: score, issue })
        .eq("id", v.id);
      if (!error) analysed += 1;
    }

    // roll the verdict up onto the conversation so the inbox shows it
    const { data: updated } = await sb
      .from("messages")
      .select("conversation_id, sentiment, sentiment_score, issue")
      .in("id", verdicts.map((v) => v.id));
    for (const m of updated ?? []) {
      if (!m.conversation_id) continue;
      await sb
        .from("conversations")
        .update({ sentiment: m.sentiment, sentiment_score: m.sentiment_score, issue: m.issue })
        .eq("id", m.conversation_id);
    }

    return { analysed, remaining: Math.max(rows.length - analysed, 0) };
  });

/* ------------------------------------------------------------------- replies */

export const replyToConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; body: string }) => {
    const body = (input.body ?? "").trim();
    if (!input.conversationId) throw new Error("Pick a conversation first.");
    if (!body) throw new Error("Write something before sending.");
    if (body.length > 2000) throw new Error("That reply is too long.");
    return { conversationId: input.conversationId, body };
  })
  .handler(async ({ data, context }): Promise<{ status: string; note: string }> => {
    const sb = context.supabase;
    const { data: convo, error } = await sb
      .from("conversations")
      .select("id, person_id, platform, channel")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error || !convo) throw new Error("That conversation is no longer available.");

    const { data: account } = await sb
      .from("social_accounts")
      .select("live")
      .eq("platform", convo.platform)
      .maybeSingle();

    const live = account?.live === true;
    const status = live ? "queued" : "staged";

    const { error: insertError } = await sb.from("messages").insert({
      person_id: convo.person_id,
      conversation_id: convo.id,
      channel: convo.channel,
      platform: convo.platform,
      kind: "dm",
      direction: "out",
      body: data.body,
      status,
    });
    if (insertError) throw new Error("The reply could not be saved.");

    await sb
      .from("conversations")
      .update({ unread: false, last_message_at: new Date().toISOString(), snippet: data.body })
      .eq("id", convo.id);

    return {
      status,
      note: live
        ? "Reply queued for sending."
        : "Reply saved. It goes out once this account is switched live.",
    };
  });

/* ------------------------------------------------------------------ accounts */

export const saveSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      handle?: string;
      externalId?: string | null;
      status?: string;
      live?: boolean;
    }) => {
      if (!input.id) throw new Error("Missing account.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch: {
      handle?: string;
      external_id?: string | null;
      status?: string;
      live?: boolean;
    } = {};
    if (typeof data.handle === "string" && data.handle.trim()) patch.handle = data.handle.trim();
    if (data.externalId !== undefined) patch.external_id = data.externalId || null;
    if (data.status) patch.status = data.status;
    if (typeof data.live === "boolean") {
      patch.live = data.live;
      patch.status = data.live ? "live" : "pending";
    }
    const { error } = await context.supabase.from("social_accounts").update(patch).eq("id", data.id);
    if (error) throw new Error("Only an admin or manager can change connected accounts.");
    return { ok: true };
  });
