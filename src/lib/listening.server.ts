/**
 * Media listening engine (server only).
 *
 * Sweeps the watchlist through Firecrawl search, stores anything new as a
 * mention, has the AI read the mood, then fires any alert rule that matches.
 * Used by the manual "Sweep now" button and by the hourly cron route.
 */

type AnyClient = {
  from: (table: string) => any;
};

const FIRECRAWL_GATEWAY = "https://connector-gateway.lovable.dev/firecrawl/v2";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const JOB_KEY = "listening_scan";
const LEASE_MINUTES = 10;

export type ScanResult = {
  ran: boolean;
  topics: number;
  found: number;
  stored: number;
  classified: number;
  alertsFired: number;
  paused?: string;
  notes: string[];
};

class PauseError extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

const isBlocking = (status: number) => status === 402 || status === 403 || status === 429;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const sourceOf = (url: string) => {
  const h = hostOf(url) ?? "";
  if (h.includes("x.com") || h.includes("twitter.com")) return "x";
  if (h.includes("facebook.com")) return "facebook";
  if (h.includes("instagram.com")) return "instagram";
  if (h.includes("tiktok.com")) return "tiktok";
  if (h.includes("youtube.com")) return "youtube";
  if (h.includes("reddit.com")) return "reddit";
  if (
    h.includes("nation.africa") ||
    h.includes("standardmedia") ||
    h.includes("the-star.co.ke") ||
    h.includes("citizen.digital") ||
    h.includes("capitalfm") ||
    h.includes("tuko.co.ke") ||
    h.includes("kenyans.co.ke") ||
    h.includes("bbc.")
  )
    return "news";
  return "web";
};

/* ------------------------------------------------------------- firecrawl */

type Found = { url: string; title: string | null; snippet: string | null; publishedAt: string | null };

async function firecrawlSearch(query: string, limit: number, tbs: string): Promise<Found[]> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !connKey) throw new PauseError("Web search is not connected.");

  const res = await fetch(`${FIRECRAWL_GATEWAY}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
    body: JSON.stringify({ query, limit, tbs }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (isBlocking(res.status)) {
      throw new PauseError(`Web search stopped (${res.status}): ${body.slice(0, 180)}`);
    }
    throw new Error(`Search failed (${res.status}): ${body.slice(0, 180)}`);
  }

  const json = (await res.json()) as any;
  const raw: any[] = Array.isArray(json?.data)
    ? json.data
    : [...(json?.data?.web ?? []), ...(json?.data?.news ?? [])];

  return raw
    .filter((r) => typeof r?.url === "string")
    .map((r) => ({
      url: r.url as string,
      title: (r.title as string) ?? null,
      snippet: (r.description as string) ?? (r.snippet as string) ?? null,
      publishedAt: typeof r.date === "string" ? r.date : null,
    }));
}

/* -------------------------------------------------------------- ai moods */

type Verdict = { id: string; sentiment: "positive" | "neutral" | "negative"; issue: string; score: number };

async function readMoods(
  items: { id: string; text: string }[],
): Promise<Verdict[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new PauseError("AI is not configured.");

  const prompt = [
    "You monitor Kenyan news, blogs and social posts for a county political campaign.",
    "Text may mix English, Kiswahili and Sheng.",
    "For each item return the mood towards the campaign (positive, neutral or negative),",
    "a short lowercase issue label (roads, water, garbage, jobs, bursaries, security, health, housing,",
    "corruption, transport, land, campaign, general), and a score from -1 (furious) to 1 (delighted).",
    "Keep the given id for each entry.",
    "",
    JSON.stringify(items),
  ].join("\n");

  const res = await fetch(AI_GATEWAY, {
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
          name: "mood_batch",
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
    if (isBlocking(res.status)) throw new PauseError(`AI stopped (${res.status}): ${body.slice(0, 180)}`);
    throw new Error(`AI request failed (${res.status}): ${body.slice(0, 180)}`);
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
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") text += evt.delta;
      } catch {
        /* skip malformed frame */
      }
    }
  }

  const parsed = JSON.parse(text) as { results?: Verdict[] };
  return parsed.results ?? [];
}

/* ------------------------------------------------------------ the sweep */

export async function runListeningScan(
  sb: AnyClient,
  opts: { topicLimit?: number; classifyLimit?: number; force?: boolean } = {},
): Promise<ScanResult> {
  const topicLimit = Math.min(Math.max(opts.topicLimit ?? 4, 1), 8);
  const classifyLimit = Math.min(Math.max(opts.classifyLimit ?? 40, 1), 60);
  const notes: string[] = [];
  const now = new Date();

  const { data: job } = await sb.from("listening_jobs").select("*").eq("key", JOB_KEY).maybeSingle();

  if (job?.status === "paused" && !opts.force) {
    return {
      ran: false,
      topics: 0,
      found: 0,
      stored: 0,
      classified: 0,
      alertsFired: 0,
      paused: job.paused_reason ?? "Paused",
      notes: ["Sweeping is paused until someone clears it."],
    };
  }
  if (job?.locked_until && new Date(job.locked_until) > now && !opts.force) {
    return {
      ran: false,
      topics: 0,
      found: 0,
      stored: 0,
      classified: 0,
      alertsFired: 0,
      notes: ["Another sweep is already running."],
    };
  }

  const lockedUntil = new Date(now.getTime() + LEASE_MINUTES * 60_000).toISOString();
  await sb
    .from("listening_jobs")
    .upsert(
      { key: JOB_KEY, locked_until: lockedUntil, status: "running", paused_reason: null, updated_at: now.toISOString() },
      { onConflict: "key" },
    );

  let found = 0;
  let stored = 0;
  let classified = 0;
  let alertsFired = 0;
  let paused: string | undefined;

  try {
    const { data: topics } = await sb
      .from("listening_topics")
      .select("*")
      .eq("active", true)
      .order("last_scanned_at", { ascending: true, nullsFirst: true })
      .limit(topicLimit);

    for (const topic of topics ?? []) {
      const extra = (topic.keywords ?? []).slice(0, 3).join(" OR ");
      const exclude = (topic.exclude_terms ?? []).map((t: string) => `-${t}`).join(" ");
      const query = [topic.query, extra ? `(${extra})` : "", exclude].filter(Boolean).join(" ").slice(0, 300);

      let hits: Found[] = [];
      try {
        hits = await firecrawlSearch(query, 10, "qdr:w");
      } catch (err) {
        if (err instanceof PauseError) throw err;
        notes.push(`${topic.label}: ${(err as Error).message}`);
        continue;
      }
      found += hits.length;

      const rows = hits.map((h) => ({
        topic_id: topic.id,
        source: sourceOf(h.url),
        domain: hostOf(h.url),
        title: h.title?.slice(0, 300) ?? null,
        url: h.url,
        snippet: h.snippet?.slice(0, 1200) ?? null,
        published_at: h.publishedAt ? new Date(h.publishedAt).toISOString() : null,
      }));

      if (rows.length) {
        const { data: ins } = await sb
          .from("listening_mentions")
          .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
          .select("id");
        stored += ins?.length ?? 0;
      }

      await sb.from("listening_topics").update({ last_scanned_at: new Date().toISOString() }).eq("id", topic.id);
    }

    // read the mood on anything not yet rated
    const { data: pending } = await sb
      .from("listening_mentions")
      .select("id, title, snippet")
      .is("sentiment", null)
      .order("found_at", { ascending: false })
      .limit(classifyLimit);

    const batch = (pending ?? []).map((m: any) => ({
      id: m.id as string,
      text: `${m.title ?? ""} — ${m.snippet ?? ""}`.slice(0, 600),
    }));

    if (batch.length) {
      const verdicts = await readMoods(batch);
      const known = new Set(batch.map((b: { id: string }) => b.id));
      for (const v of verdicts) {
        if (!known.has(v.id)) continue;
        const score = Math.max(-1, Math.min(1, Number(v.score) || 0));
        const { error } = await sb
          .from("listening_mentions")
          .update({
            sentiment: v.sentiment,
            sentiment_score: score,
            issue: (v.issue || "general").toLowerCase().slice(0, 40),
          })
          .eq("id", v.id);
        if (!error) classified += 1;
      }
    }

    alertsFired = await evaluateAlerts(sb);
  } catch (err) {
    if (err instanceof PauseError) {
      paused = err.reason;
      await sb
        .from("listening_jobs")
        .update({
          status: "paused",
          paused_reason: err.reason,
          locked_until: null,
          last_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("key", JOB_KEY);
      return { ran: true, topics: 0, found, stored, classified, alertsFired, paused, notes };
    }
    notes.push((err as Error).message);
  }

  await sb
    .from("listening_jobs")
    .update({
      status: "idle",
      locked_until: null,
      last_run_at: new Date().toISOString(),
      detail: notes.join(" · ").slice(0, 400) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("key", JOB_KEY);

  return { ran: true, topics: topicLimit, found, stored, classified, alertsFired, notes };
}

/* ------------------------------------------------------------- the alerts */

const HOURS = (h: number) => h * 3600_000;

export async function evaluateAlerts(sb: AnyClient): Promise<number> {
  const { data: alerts } = await sb.from("listening_alerts").select("*").eq("active", true);
  if (!alerts?.length) return 0;

  const since = new Date(Date.now() - HOURS(48)).toISOString();
  const { data: mentions } = await sb
    .from("listening_mentions")
    .select("id, topic_id, title, snippet, url, sentiment, issue, found_at")
    .gte("found_at", since)
    .not("sentiment", "is", null)
    .order("found_at", { ascending: false })
    .limit(300);

  const { data: fired } = await sb
    .from("listening_alert_events")
    .select("alert_id, mention_id")
    .gte("created_at", since);
  const already = new Set((fired ?? []).map((f: any) => `${f.alert_id}:${f.mention_id}`));

  const { data: wa } = await sb.from("social_accounts").select("live").eq("platform", "whatsapp").maybeSingle();
  const whatsappLive = wa?.live === true;

  let count = 0;

  for (const alert of alerts) {
    if (alert.frequency === "daily" && alert.last_fired_at) {
      if (Date.now() - new Date(alert.last_fired_at).getTime() < HOURS(24)) continue;
    }
    const words: string[] = (alert.keywords ?? []).map((k: string) => k.toLowerCase()).filter(Boolean);
    const moods: string[] = alert.sentiments ?? [];

    const matched = (mentions ?? []).filter((m: any) => {
      if (already.has(`${alert.id}:${m.id}`)) return false;
      if (alert.topic_id && m.topic_id !== alert.topic_id) return false;
      if (moods.length && !moods.includes(m.sentiment)) return false;
      if (!words.length) return true;
      const hay = `${m.title ?? ""} ${m.snippet ?? ""}`.toLowerCase();
      return words.some((w) => hay.includes(w));
    });

    if (matched.length < (alert.min_matches ?? 1)) continue;

    const subject = `Groundwork alert · ${alert.name} (${matched.length})`;
    const body = matched
      .slice(0, 10)
      .map((m: any) => `• [${m.sentiment}] ${m.title ?? m.url}\n  ${m.url}`)
      .join("\n");

    const channel = alert.channel as string;
    const deliverable = channel === "whatsapp" ? whatsappLive : false;
    const detail =
      channel === "email"
        ? "Waiting on the campaign sender domain being set up."
        : whatsappLive
          ? null
          : "Waiting on the WhatsApp Business number being switched live.";

    const events = matched.slice(0, 10).map((m: any) => ({
      alert_id: alert.id,
      mention_id: m.id,
      channel,
      destination: alert.destination,
      subject,
      body,
      status: deliverable ? "queued" : "staged",
      detail,
    }));

    const { error } = await sb.from("listening_alert_events").insert(events);
    if (error) continue;

    await sb.from("listening_alerts").update({ last_fired_at: new Date().toISOString() }).eq("id", alert.id);
    count += events.length;
  }

  return count;
}
