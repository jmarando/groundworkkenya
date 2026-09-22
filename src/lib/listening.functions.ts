import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Mention = {
  id: string;
  topicId: string | null;
  topic: string | null;
  source: string;
  domain: string | null;
  title: string | null;
  url: string;
  snippet: string | null;
  publishedAt: string | null;
  foundAt: string;
  sentiment: string | null;
  sentimentScore: number | null;
  issue: string | null;
  status: string;
};

export type ListeningAlert = {
  id: string;
  name: string;
  topicId: string | null;
  keywords: string[];
  sentiments: string[];
  channel: string;
  destination: string;
  minMatches: number;
  frequency: string;
  active: boolean;
  lastFiredAt: string | null;
};

export type ListeningData = {
  topics: {
    id: string;
    label: string;
    query: string;
    keywords: string[];
    excludeTerms: string[];
    kind: string;
    active: boolean;
    lastScannedAt: string | null;
    mentions: number;
    negative: number;
  }[];
  mentions: Mention[];
  alerts: ListeningAlert[];
  events: {
    id: string;
    alert: string | null;
    channel: string;
    destination: string;
    subject: string | null;
    status: string;
    detail: string | null;
    at: string;
  }[];
  totals: {
    mentions: number;
    last24h: number;
    prev24h: number;
    positive: number;
    neutral: number;
    negative: number;
    unrated: number;
    needsReview: number;
    inboundIssues: number;
  };
  byDay: { day: string; positive: number; neutral: number; negative: number }[];
  bySource: { source: string; n: number; negative: number }[];
  byIssue: { issue: string; n: number; negative: number; prev: number }[];
  byDomain: { domain: string; n: number; negative: number }[];
  ownedIssues: { issue: string; n: number }[];
  job: { status: string; lastRunAt: string | null; pausedReason: string | null; detail: string | null } | null;
};

const dayKey = (iso: string) => iso.slice(0, 10);

export const getListening = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListeningData> => {
    const sb = context.supabase;

    const [{ data: topics }, { data: mentions }, { data: alerts }, { data: events }, { data: job }, { data: convos }] =
      await Promise.all([
        sb.from("listening_topics").select("*").order("label"),
        sb
          .from("listening_mentions")
          .select("*")
          .order("found_at", { ascending: false })
          .limit(600),
        sb.from("listening_alerts").select("*").order("created_at", { ascending: false }),
        sb
          .from("listening_alert_events")
          .select("id, alert_id, channel, destination, subject, status, detail, created_at")
          .order("created_at", { ascending: false })
          .limit(40),
        sb.from("listening_jobs").select("*").eq("key", "listening_scan").maybeSingle(),
        sb.from("conversations").select("issue").limit(1000),
      ]);

    const topicById = new Map((topics ?? []).map((t: any) => [t.id, t]));
    const rows = mentions ?? [];
    const now = Date.now();
    const H24 = 86_400_000;

    const bucket = (s: string | null) =>
      s === "positive" || s === "negative" || s === "neutral" ? s : null;

    const dayMap = new Map<string, { positive: number; neutral: number; negative: number }>();
    const sourceMap = new Map<string, { n: number; negative: number }>();
    const issueMap = new Map<string, { n: number; negative: number; prev: number }>();
    const domainMap = new Map<string, { n: number; negative: number }>();

    for (const m of rows as any[]) {
      const found = new Date(m.found_at).getTime();
      const recent = now - found <= H24;
      const b = bucket(m.sentiment);

      const d = dayMap.get(dayKey(m.found_at)) ?? { positive: 0, neutral: 0, negative: 0 };
      if (b) d[b] += 1;
      dayMap.set(dayKey(m.found_at), d);

      const s = sourceMap.get(m.source) ?? { n: 0, negative: 0 };
      s.n += 1;
      if (b === "negative") s.negative += 1;
      sourceMap.set(m.source, s);

      const key = m.issue ?? "unsorted";
      const i = issueMap.get(key) ?? { n: 0, negative: 0, prev: 0 };
      if (recent) i.n += 1;
      else if (now - found <= H24 * 2) i.prev += 1;
      if (b === "negative") i.negative += 1;
      issueMap.set(key, i);

      if (m.domain) {
        const dm = domainMap.get(m.domain) ?? { n: 0, negative: 0 };
        dm.n += 1;
        if (b === "negative") dm.negative += 1;
        domainMap.set(m.domain, dm);
      }
    }

    const ownedMap = new Map<string, number>();
    for (const c of (convos ?? []) as any[]) {
      if (!c.issue) continue;
      ownedMap.set(c.issue, (ownedMap.get(c.issue) ?? 0) + 1);
    }

    const perTopic = new Map<string, { n: number; negative: number }>();
    for (const m of rows as any[]) {
      if (!m.topic_id) continue;
      const cur = perTopic.get(m.topic_id) ?? { n: 0, negative: 0 };
      cur.n += 1;
      if (m.sentiment === "negative") cur.negative += 1;
      perTopic.set(m.topic_id, cur);
    }

    return {
      topics: (topics ?? []).map((t: any) => ({
        id: t.id,
        label: t.label,
        query: t.query,
        keywords: t.keywords ?? [],
        excludeTerms: t.exclude_terms ?? [],
        kind: t.kind,
        active: t.active,
        lastScannedAt: t.last_scanned_at,
        mentions: perTopic.get(t.id)?.n ?? 0,
        negative: perTopic.get(t.id)?.negative ?? 0,
      })),
      mentions: (rows as any[]).map((m) => ({
        id: m.id,
        topicId: m.topic_id,
        topic: m.topic_id ? (topicById.get(m.topic_id)?.label ?? null) : null,
        source: m.source,
        domain: m.domain,
        title: m.title,
        url: m.url,
        snippet: m.snippet,
        publishedAt: m.published_at,
        foundAt: m.found_at,
        sentiment: m.sentiment,
        sentimentScore: m.sentiment_score === null ? null : Number(m.sentiment_score),
        issue: m.issue,
        status: m.status,
      })),
      alerts: (alerts ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        topicId: a.topic_id,
        keywords: a.keywords ?? [],
        sentiments: a.sentiments ?? [],
        channel: a.channel,
        destination: a.destination,
        minMatches: a.min_matches,
        frequency: a.frequency,
        active: a.active,
        lastFiredAt: a.last_fired_at,
      })),
      events: (events ?? []).map((e: any) => ({
        id: e.id,
        alert: (alerts ?? []).find((a: any) => a.id === e.alert_id)?.name ?? null,
        channel: e.channel,
        destination: e.destination,
        subject: e.subject,
        status: e.status,
        detail: e.detail,
        at: e.created_at,
      })),
      totals: {
        mentions: rows.length,
        last24h: (rows as any[]).filter((m) => now - new Date(m.found_at).getTime() <= H24).length,
        prev24h: (rows as any[]).filter((m) => {
          const age = now - new Date(m.found_at).getTime();
          return age > H24 && age <= H24 * 2;
        }).length,
        positive: (rows as any[]).filter((m) => m.sentiment === "positive").length,
        neutral: (rows as any[]).filter((m) => m.sentiment === "neutral").length,
        negative: (rows as any[]).filter((m) => m.sentiment === "negative").length,
        unrated: (rows as any[]).filter((m) => !m.sentiment).length,
        needsReview: (rows as any[]).filter((m) => m.status === "new" && m.sentiment === "negative").length,
        inboundIssues: ownedMap.size,
      },
      byDay: [...dayMap.entries()]
        .map(([day, v]) => ({ day, ...v }))
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-14),
      bySource: [...sourceMap.entries()]
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.n - a.n),
      byIssue: [...issueMap.entries()]
        .map(([issue, v]) => ({ issue, ...v }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 12),
      byDomain: [...domainMap.entries()]
        .map(([domain, v]) => ({ domain, ...v }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 10),
      ownedIssues: [...ownedMap.entries()]
        .map(([issue, n]) => ({ issue, n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 10),
      job: job
        ? {
            status: job.status,
            lastRunAt: job.last_run_at,
            pausedReason: job.paused_reason,
            detail: job.detail,
          }
        : null,
    };
  });

/* ------------------------------------------------------------------ sweep */

export const sweepListening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { force?: boolean } | undefined) => ({ force: input?.force === true }))
  .handler(async ({ data, context }) => {
    const { runListeningScan } = await import("@/lib/listening.server");
    return runListeningScan(context.supabase as never, {
      topicLimit: 6,
      classifyLimit: 50,
      force: data.force,
    });
  });

/* ----------------------------------------------------------------- topics */

const words = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

export const saveTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      label: string;
      query: string;
      keywords?: string;
      excludeTerms?: string;
      kind?: string;
      active?: boolean;
    }) => {
      const label = (input.label ?? "").trim();
      const query = (input.query ?? "").trim();
      if (!label) throw new Error("Give the topic a name.");
      if (!query) throw new Error("Add the words to search for.");
      return { ...input, label: label.slice(0, 80), query: query.slice(0, 200) };
    },
  )
  .handler(async ({ data, context }) => {
    const patch = {
      label: data.label,
      query: data.query,
      keywords: words(data.keywords),
      exclude_terms: words(data.excludeTerms),
      kind: data.kind ?? "issue",
      active: data.active ?? true,
    };
    const sb = context.supabase;
    const { error } = data.id
      ? await sb.from("listening_topics").update(patch).eq("id", data.id)
      : await sb.from("listening_topics").insert(patch);
    if (error) throw new Error("Only an admin or manager can change the watchlist.");
    return { ok: true };
  });

export const toggleTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; active: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("listening_topics")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error("Only an admin or manager can change the watchlist.");
    return { ok: true };
  });

export const deleteTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("listening_topics").delete().eq("id", data.id);
    if (error) throw new Error("Only an admin or manager can remove a topic.");
    return { ok: true };
  });

/* ----------------------------------------------------------------- alerts */

export const saveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      name: string;
      topicId?: string | null;
      keywords?: string;
      sentiments?: string[];
      channel: string;
      destination: string;
      minMatches?: number;
      frequency?: string;
      active?: boolean;
    }) => {
      const name = (input.name ?? "").trim();
      const destination = (input.destination ?? "").trim();
      if (!name) throw new Error("Name the alert.");
      if (!destination) throw new Error("Add an email address or phone number.");
      if (input.channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destination))
        throw new Error("That does not look like an email address.");
      if (input.channel === "whatsapp" && !/^\+?\d{9,15}$/.test(destination.replace(/\s/g, "")))
        throw new Error("Use a phone number like +254712345678.");
      return { ...input, name: name.slice(0, 80), destination };
    },
  )
  .handler(async ({ data, context }) => {
    const patch = {
      name: data.name,
      topic_id: data.topicId || null,
      keywords: words(data.keywords),
      sentiments: data.sentiments?.length ? data.sentiments : ["negative"],
      channel: data.channel,
      destination: data.destination,
      min_matches: Math.min(Math.max(data.minMatches ?? 1, 1), 20),
      frequency: data.frequency ?? "instant",
      active: data.active ?? true,
    };
    const sb = context.supabase;
    const { error } = data.id
      ? await sb.from("listening_alerts").update(patch).eq("id", data.id)
      : await sb.from("listening_alerts").insert(patch);
    if (error) throw new Error("Only an admin or manager can change alerts.");
    return { ok: true };
  });

export const toggleAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; active: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("listening_alerts")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error("Only an admin or manager can change alerts.");
    return { ok: true };
  });

export const deleteAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("listening_alerts").delete().eq("id", data.id);
    if (error) throw new Error("Only an admin or manager can remove an alert.");
    return { ok: true };
  });

export const testAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: alert } = await sb.from("listening_alerts").select("*").eq("id", data.id).maybeSingle();
    if (!alert) throw new Error("That alert no longer exists.");
    const { error } = await sb.from("listening_alert_events").insert({
      alert_id: alert.id,
      channel: alert.channel,
      destination: alert.destination,
      subject: `Test · ${alert.name}`,
      body: "This is a test of the alert route. No mentions attached.",
      status: "staged",
      detail:
        alert.channel === "email"
          ? "Waiting on the campaign sender domain being set up."
          : "Waiting on the WhatsApp Business number being switched live.",
    });
    if (error) throw new Error("Only an admin or manager can test alerts.");
    return { ok: true };
  });

/* --------------------------------------------------------------- mentions */

export const setMentionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string }) => {
    if (!["new", "reviewed", "actioned", "ignored"].includes(input.status))
      throw new Error("Unknown status.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("listening_mentions")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error("Only an admin or manager can update a mention.");
    return { ok: true };
  });

export const resumeListening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("listening_jobs")
      .update({ status: "idle", paused_reason: null, locked_until: null })
      .eq("key", "listening_scan");
    if (error) throw new Error("Only an admin or manager can restart sweeping.");
    return { ok: true };
  });
