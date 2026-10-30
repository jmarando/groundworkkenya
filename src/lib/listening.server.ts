/**
 * Media listening engine (server only).
 *
 * Sweeps the watchlist through the Kenyan outlets' own news feeds, Google News's search feed and
 * each keyword's Google Alert, plus ScrapeCreators keyword searches (TikTok, Reddit, YouTube),
 * stores anything new as a mention, has the AI (Gemini, on the campaign's own key) read the mood,
 * then fires any alert rule that matches. Used by the manual "Sweep now" button and by the hourly
 * cron route.
 */

import { answerFault } from "./ai-answer";
import { ALERT_FEED, parseAlertFeed } from "./alerts-feed";
import {
  type AiTier,
  GEMINI_MODELS,
  geminiAnswer,
  geminiBody,
  geminiBusy,
  geminiError,
  geminiKeyRefused,
  geminiUrl,
} from "./gemini";
import { recent, storiesFor, titleKey } from "./news-feeds";
import { googleNewsSearch, readOutletFeeds } from "./news-sources.server";
import { takeCredits } from "./social-credits";
import { OFF_TOPIC } from "./top-of-mind";
import {
  ScrapeCreatorsCreditError,
  scConfigured,
  scSearchReddit,
  scSearchTikTok,
  scSearchYouTube,
} from "./scrapecreators.server";

type AnyClient = {
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

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

export class PauseError extends Error {
  reason: string;
  constructor(
    reason: string,
    public status?: number,
  ) {
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

/* ------------------------------------------------------------- free news */

type Found = {
  url: string;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
  /** Set when the address doesn't say where it came from (Google Alerts, Google News). */
  source?: string;
  /** The outlet's own site, when the address is Google's. */
  domain?: string | null;
  author?: string | null;
  reach?: number | null;
  shares?: number | null;
};

/** The headlines each campaign already holds from the last week, so one story read twice is kept once. */
type Seen = Map<string, Set<string>>;

async function recentTitles(sb: AnyClient, now: number): Promise<Seen> {
  const { data } = await sb
    .from("listening_mentions")
    .select("campaign_id, title")
    .in("source", ["news", "web", "google_alerts"])
    .gte("found_at", new Date(now - 7 * 86_400_000).toISOString())
    .limit(5000);
  const seen: Seen = new Map();
  for (const r of (data ?? []) as { campaign_id: string | null; title: string | null }[]) {
    const key = titleKey(r.title);
    if (!key || !r.campaign_id) continue;
    const set = seen.get(r.campaign_id) ?? new Set<string>();
    set.add(key);
    seen.set(r.campaign_id, set);
  }
  return seen;
}

/** True the first time a campaign meets a headline; it is then noted as met. */
function isNew(seen: Seen, campaign: string | null | undefined, title: string | null): boolean {
  const key = titleKey(title);
  if (!key || !campaign) return true;
  const set = seen.get(campaign) ?? new Set<string>();
  seen.set(campaign, set);
  if (set.has(key)) return false;
  set.add(key);
  return true;
}

/**
 * The outlets' own feeds, read once and set against every active keyword, whichever the hour's
 * rotation is on: matching costs nothing, so no keyword waits its turn. Nothing here is paid for.
 */
async function outletPass(
  sb: AnyClient,
  seen: Seen,
  failed: { outlets: number; stored: number },
  notes: string[],
): Promise<{ found: number; stored: number }> {
  const read = await readOutletFeeds();
  if (read.failed.length) {
    failed.outlets += read.failed.length;
    notes.push(`News feeds that did not answer: ${read.failed.join(", ")}.`);
  }
  const fresh = recent(read.stories, 7);
  if (!fresh.length) return { found: 0, stored: 0 };

  const { data: topics } = await sb
    .from("listening_topics")
    .select("id, campaign_id, label, query, keywords, exclude_terms")
    .eq("active", true);

  let found = 0;
  let stored = 0;
  for (const topic of topics ?? []) {
    const hits = storiesFor(topic, fresh).filter((s) => isNew(seen, topic.campaign_id, s.title));
    if (!hits.length) continue;
    found += hits.length;
    const rows = hits.map((h) => ({
      campaign_id: topic.campaign_id,
      topic_id: topic.id,
      source: "news",
      domain: hostOf(h.url),
      title: h.title?.slice(0, 300) ?? null,
      url: h.url,
      snippet: h.snippet?.slice(0, 1200) ?? null,
      published_at: h.publishedAt,
    }));
    const { data: ins, error } = await sb
      .from("listening_mentions")
      .upsert(rows, { onConflict: "campaign_id,url", ignoreDuplicates: true })
      .select("id");
    if (error) {
      failed.stored++;
      notes.push(
        `${topic.label}: what the news feeds found could not be stored (${error.message}).`,
      );
    }
    stored += ins?.length ?? 0;
  }
  return { found, stored };
}

/* -------------------------------------------------------------- ai moods */

type Verdict = {
  id: string;
  sentiment: "positive" | "neutral" | "negative";
  issue: string;
  score: number;
};

const MOOD_SCHEMA = {
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
};

async function readMoods(
  items: { id: string; text: string; campaign?: string; keyword?: string }[],
): Promise<Verdict[]> {
  const prompt = [
    "You monitor Kenyan news, blogs and social posts for political campaigns.",
    "Each item names the campaign (candidate and seat) and the keyword that found it.",
    "Text may mix English, Kiswahili and Sheng.",
    "For each item return the mood towards that campaign (positive, neutral or negative),",
    "a short lowercase issue label (roads, water, garbage, jobs, bursaries, security, health, housing,",
    "corruption, transport, land, campaign, general), and a score from -1 (furious) to 1 (delighted).",
    `Use the issue "${OFF_TOPIC}" when the item is an advert, a job listing or promotion, or is not`,
    "about the campaign's seat, its candidate, its rivals or the keyword's subject (for example a",
    "post about another county or constituency that a search happened to return).",
    "Keep the given id for each entry.",
    "",
    JSON.stringify(items),
  ].join("\n");
  const parsed = await askAiJson<{ results?: Verdict[] }>(
    prompt,
    "mood_batch",
    MOOD_SCHEMA,
    90_000,
    "read",
  );
  return parsed.results ?? [];
}

/** Google failed on its side (busy or broken), so the tier's next model may answer. */
class BusyError extends Error {}

/** One model asked once: Gemini's reply as JSON, or an error that says what went wrong. */
async function askGemini(
  model: string,
  key: string,
  prompt: string,
  schema: object,
  timeoutMs: number,
): Promise<unknown> {
  try {
    const res = await fetch(geminiUrl(model), {
      signal: AbortSignal.timeout(timeoutMs),
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(geminiBody(prompt, schema)),
    });
    const body = await res.text();
    if (!res.ok) {
      const why = geminiError(body);
      // A limit reached, or the key itself turned away: stop the sweep rather than ask again.
      if (isBlocking(res.status) || geminiKeyRefused(res.status, body))
        throw new PauseError(`AI stopped (${res.status}): ${why}`, res.status);
      const failed = `AI request failed (${res.status}): ${why}`;
      throw geminiBusy(res.status) ? new BusyError(failed) : new Error(failed);
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`AI answer unreadable (${body.length} characters, not JSON).`);
    }
  } catch (err) {
    const why = (err as { name?: unknown } | null)?.name;
    if (why === "TimeoutError" || why === "AbortError")
      throw new Error(
        `AI took too long (no full answer within ${Math.round(timeoutMs / 1000)} s).`,
      );
    throw err;
  }
}

/**
 * One structured answer from Gemini (Google's AI, on the campaign's own key, GEMINI_API_KEY),
 * parsed. `tier` picks the models: "read" for posts in bulk, "write" for anything written for a
 * person; when Google says one is busy, the tier's next model is asked. An answer that runs past
 * `timeoutMs`, is cut off or fails says so in its error ("AI took too long", "AI answer cut off",
 * "AI answer failed"); src/lib/ai-answer.ts puts those in plain words. The name each caller gives
 * its schema is no longer needed and is kept for them.
 */
export async function askAiJson<T>(
  prompt: string,
  _name: string,
  schema: object,
  timeoutMs = 90_000,
  tier: AiTier = "write",
): Promise<T> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new PauseError("AI is not configured.");

  const models = GEMINI_MODELS[tier];
  let json: unknown;
  for (const [i, model] of models.entries()) {
    try {
      json = await askGemini(model, key, prompt, schema, timeoutMs);
      break;
    } catch (err) {
      if (err instanceof BusyError && i < models.length - 1) continue;
      throw err;
    }
  }

  const answer = geminiAnswer(json);
  const fault = answerFault(answer);
  if (fault) throw new Error(fault);
  try {
    return JSON.parse(answer.text) as T;
  } catch {
    throw new Error(`AI answer unreadable (${answer.text.length} characters).`);
  }
}

/* ------------------------------------------------------------ the sweep */

export async function runListeningScan(
  sb: AnyClient,
  opts: {
    topicLimit?: number;
    classifyLimit?: number;
    force?: boolean;
    /** Who counts ScrapeCreators credits: the server's own client (sb when left out); null: none spent. */
    credits?: Pick<AnyClient, "rpc"> | null;
  } = {},
): Promise<ScanResult> {
  let topicLimit = Math.min(Math.max(opts.topicLimit ?? 4, 1), 8);
  const classifyLimit = Math.min(Math.max(opts.classifyLimit ?? 40, 1), 60);
  const notes: string[] = [];
  // Every campaign's team can read the job row, so what it says names no keyword:
  // shared notes and counts only. The names go back to whoever swept in notes.
  const shared: string[] = [];
  const failed = { searches: 0, feeds: 0, social: 0, stored: 0, outlets: 0 };
  const say = (note: string) => {
    notes.push(note);
    shared.push(note);
  };
  const now = new Date();

  const { data: job } = await sb
    .from("listening_jobs")
    .select("*")
    .eq("key", JOB_KEY)
    .maybeSingle();

  // Paused because the AI refused work (a limit reached or the key turned away: 400/402/403/429):
  // try one keyword six hours later. If it is still refused the pause stands, so no work is
  // repeated; if the limit is lifted or the key mended, collection carries on by itself instead of
  // waiting for someone to notice the mornings are empty.
  const pausedOnCredits = /\((400|402|403|429)\)/.test(String(job?.paused_reason ?? ""));
  const pausedSince = job?.last_run_at ? Date.parse(job.last_run_at) : 0;
  const probe =
    job?.status === "paused" &&
    pausedOnCredits &&
    pausedSince > 0 &&
    now.getTime() - pausedSince > 6 * 3600_000;

  if (job?.status === "paused" && !opts.force && !probe) {
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
  if (probe) {
    topicLimit = 1;
    say("Collection was paused, so one keyword was tried to see if it works again.");
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
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      locked_until: lockedUntil,
      status: "running",
      paused_reason: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );

  let found = 0;
  let stored = 0;
  let classified = 0;
  let alertsFired = 0;
  let paused: string | undefined;
  let keywordsSpent = false;

  try {
    const seen = await recentTitles(sb, now.getTime());

    // The outlets' own feeds against every keyword: free, so it never waits for a keyword's turn.
    try {
      const outlets = await outletPass(sb, seen, failed, notes);
      found += outlets.found;
      stored += outlets.stored;
    } catch (err) {
      failed.outlets++;
      notes.push(`The outlets' news feeds could not be read (${(err as Error).message}).`);
    }

    const { data: topics } = await sb
      .from("listening_topics")
      .select("*")
      .eq("active", true)
      .order("last_scanned_at", { ascending: true, nullsFirst: true })
      .limit(topicLimit);

    for (const topic of topics ?? []) {
      const extra = (topic.keywords ?? []).slice(0, 3).join(" OR ");
      const exclude = (topic.exclude_terms ?? []).map((t: string) => `-${t}`).join(" ");
      const query = [topic.query, extra ? `(${extra})` : "", exclude]
        .filter(Boolean)
        .join(" ")
        .slice(0, 300);

      // Google News's search feed for the keyword: free and not guaranteed, so a refusal is noted
      // and the rest of the keyword (its Google Alert, the social searches) still runs.
      let hits: Found[] = [];
      try {
        const news = await googleNewsSearch(query);
        hits = recent(news, 7)
          .filter((h) => isNew(seen, topic.campaign_id, h.title))
          .map((h) => ({ ...h, source: "news" }));
      } catch (err) {
        failed.searches++;
        notes.push(`${topic.label}: ${(err as Error).message}`);
      }
      found += hits.length;

      // The keyword's Google Alert feed, when it has one: no credits used.
      const feed = typeof topic.alert_feed_url === "string" ? topic.alert_feed_url : "";
      if (feed && !ALERT_FEED.test(feed)) {
        failed.feeds++;
        notes.push(
          `${topic.label}: its alert link is not a Google Alerts feed, so it was not read.`,
        );
      } else if (feed) {
        try {
          const res = await fetch(feed, {
            signal: AbortSignal.timeout(15_000),
            headers: { Accept: "application/atom+xml, application/xml" },
          });
          if (!res.ok) throw new Error(`the feed answered ${res.status}`);
          const entries = parseAlertFeed(await res.text());
          hits.push(...entries.map((e) => ({ ...e, source: "google_alerts" })));
          found += entries.length;
        } catch (err) {
          failed.feeds++;
          notes.push(`${topic.label} Google Alert: ${(err as Error).message}`);
        }
      }

      // social platforms via ScrapeCreators — best effort, never pauses the sweep
      let socialFound = 0;
      const counter = opts.credits === undefined ? sb : opts.credits;
      if (scConfigured() && counter) {
        const kw = (topic.query ?? topic.label ?? "").trim().slice(0, 80);
        // Three searches, three credits, from the day's keyword budget.
        if (kw && !keywordsSpent && !(await takeCredits(counter, "keywords", 3))) {
          keywordsSpent = true;
          say("Social keyword search stopped: today's ScrapeCreators credits for it are used.");
        }
        if (kw && !keywordsSpent) {
          const social = await Promise.allSettled([
            scSearchTikTok(kw, 8),
            scSearchReddit(kw, 8),
            scSearchYouTube(kw, 8),
          ]);
          let creditNoted = false;
          for (const r of social) {
            if (r.status === "fulfilled") {
              hits.push(...r.value);
              socialFound += r.value.length;
              continue;
            }
            const err = r.reason instanceof Error ? r.reason : new Error(String(r.reason));
            if (err instanceof ScrapeCreatorsCreditError) {
              if (!creditNoted) {
                say("Social search skipped — ScrapeCreators is out of credits.");
                creditNoted = true;
              }
            } else {
              failed.social++;
              notes.push(`${topic.label} social: ${err.message}`);
            }
          }
        }
      }
      found += socialFound;

      const rows = hits.map((h) => ({
        topic_id: topic.id,
        source: h.source ?? sourceOf(h.url),
        domain: h.domain ?? hostOf(h.url),
        title: h.title?.slice(0, 300) ?? null,
        url: h.url,
        snippet: h.snippet?.slice(0, 1200) ?? null,
        published_at: h.publishedAt ? new Date(h.publishedAt).toISOString() : null,
        author: h.author?.slice(0, 120) ?? null,
        reach: h.reach ?? null,
        shares: h.shares ?? null,
      }));

      if (rows.length) {
        // Unique per campaign: the same story can matter to two campaigns.
        const { data: ins, error: insErr } = await sb
          .from("listening_mentions")
          .upsert(rows, { onConflict: "campaign_id,url", ignoreDuplicates: true })
          .select("id");
        if (insErr) {
          failed.stored++;
          notes.push(`${topic.label}: what was found could not be stored (${insErr.message}).`);
        }
        stored += ins?.length ?? 0;
        // A post found again keeps its latest views and shares, so a spreading post shows it.
        for (const r of rows.filter((x) => x.reach !== null && topic.campaign_id)) {
          await sb
            .from("listening_mentions")
            .update({ reach: r.reach, shares: r.shares })
            .eq("campaign_id", topic.campaign_id)
            .eq("url", r.url)
            .lt("reach", r.reach);
        }
      }

      await sb
        .from("listening_topics")
        .update({ last_scanned_at: new Date().toISOString() })
        .eq("id", topic.id);
    }

    // read the mood on anything not yet rated
    const { data: pending } = await sb
      .from("listening_mentions")
      .select("id, title, snippet, campaign_id, topic_id")
      .is("sentiment", null)
      .order("found_at", { ascending: false })
      .limit(classifyLimit);

    // Each post is read against its own campaign and keyword, so a stray result can be set aside.
    const ids = (k: "campaign_id" | "topic_id") => [
      ...new Set((pending ?? []).map((m: any) => m[k]).filter(Boolean)),
    ];
    const [{ data: camps }, { data: kws }] = await Promise.all([
      ids("campaign_id").length
        ? sb.from("campaigns").select("id, candidate, seat").in("id", ids("campaign_id"))
        : Promise.resolve({ data: [] }),
      ids("topic_id").length
        ? sb.from("listening_topics").select("id, label, query").in("id", ids("topic_id"))
        : Promise.resolve({ data: [] }),
    ]);
    const campOf = new Map(
      (camps ?? []).map((c: any) => [c.id, [c.candidate, c.seat].filter(Boolean).join(", ")]),
    );
    const kwOf = new Map(
      (kws ?? []).map((t: any) => [t.id, t.query ? `${t.label} (${t.query})` : t.label]),
    );
    const batch = (pending ?? []).map((m: any) => ({
      id: m.id as string,
      ...(campOf.get(m.campaign_id) ? { campaign: campOf.get(m.campaign_id) as string } : {}),
      ...(kwOf.get(m.topic_id) ? { keyword: kwOf.get(m.topic_id) as string } : {}),
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
    shared.push("The sweep stopped early on an error.");
  }

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const counts = [
    failed.searches && `${count(failed.searches, "keyword", "keywords")} could not be searched.`,
    failed.outlets && `${count(failed.outlets, "news feed", "news feeds")} did not answer.`,
    failed.feeds &&
      `${count(failed.feeds, "Google Alert feed", "Google Alert feeds")} could not be read.`,
    failed.social && `${count(failed.social, "social search", "social searches")} failed.`,
    failed.stored &&
      `What ${count(failed.stored, "keyword", "keywords")} found could not be stored.`,
  ].filter((c): c is string => Boolean(c));
  await sb
    .from("listening_jobs")
    .update({
      status: "idle",
      locked_until: null,
      last_run_at: new Date().toISOString(),
      detail: [...shared, ...counts].join(" · ").slice(0, 400) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("key", JOB_KEY);

  return { ran: true, topics: topicLimit, found, stored, classified, alertsFired, notes };
}

/* ------------------------------------------------------------- the alerts */

const HOURS = (h: number) => h * 3600_000;

/**
 * Each campaign's alerts against its own posts of the last 48 hours: keywords, moods and, when an
 * alert asks, how far a post spread. Email goes out at once through the managed sender; "app"
 * alerts wait in Listening; WhatsApp waits until the campaign's number is live.
 */
export async function evaluateAlerts(sb: AnyClient): Promise<number> {
  const { data: alerts } = await sb.from("listening_alerts").select("*").eq("active", true);
  if (!alerts?.length) return 0;

  const since = new Date(Date.now() - HOURS(48)).toISOString();
  const campaigns = [...new Set(alerts.map((a: any) => a.campaign_id as string))].filter(Boolean);
  const { data: names } = await sb.from("campaigns").select("id, name").in("id", campaigns);
  const nameOf = new Map((names ?? []).map((c: any) => [c.id, c.name as string]));

  const { data: fired } = await sb
    .from("listening_alert_events")
    .select("alert_id, mention_id")
    .gte("created_at", since);
  const already = new Set((fired ?? []).map((f: any) => `${f.alert_id}:${f.mention_id}`));

  let count = 0;

  for (const campaignId of campaigns) {
    const { data: mentions } = await sb
      .from("listening_mentions")
      .select(
        "id, topic_id, title, snippet, url, sentiment, issue, found_at, reach, author, source",
      )
      .eq("campaign_id", campaignId)
      .or(`issue.is.null,issue.neq.${OFF_TOPIC}`)
      .gte("found_at", since)
      .order("found_at", { ascending: false })
      .limit(400);
    const { data: wa } = await sb
      .from("social_accounts")
      .select("live")
      .eq("campaign_id", campaignId)
      .eq("platform", "whatsapp")
      .maybeSingle();
    const whatsappLive = wa?.live === true;

    for (const alert of alerts.filter((a: any) => a.campaign_id === campaignId)) {
      if (alert.frequency === "daily" && alert.last_fired_at) {
        if (Date.now() - new Date(alert.last_fired_at).getTime() < HOURS(24)) continue;
      }
      const words: string[] = (alert.keywords ?? [])
        .map((k: string) => k.toLowerCase())
        .filter(Boolean);
      const moods: string[] = alert.sentiments ?? [];
      const minReach: number | null = alert.min_reach ?? null;

      const matched = (mentions ?? []).filter((m: any) => {
        if (already.has(`${alert.id}:${m.id}`)) return false;
        if (alert.topic_id && m.topic_id !== alert.topic_id) return false;
        if (minReach !== null) {
          if ((m.reach ?? 0) < minReach) return false;
        } else {
          // Without a reach rule an alert waits for the mood to be read.
          if (!m.sentiment) return false;
          if (moods.length && !moods.includes(m.sentiment)) return false;
        }
        if (minReach !== null && moods.length && m.sentiment && !moods.includes(m.sentiment))
          return false;
        if (!words.length) return true;
        const hay = `${m.title ?? ""} ${m.snippet ?? ""}`.toLowerCase();
        return words.some((w) => hay.includes(w));
      });

      if (matched.length < (alert.min_matches ?? 1)) continue;

      const subject = `Groundwork alert · ${alert.name} (${matched.length})`;
      const body = matched
        .slice(0, 10)
        .map(
          (m: any) =>
            `• ${m.sentiment ? `[${m.sentiment}] ` : ""}${m.title ?? m.url}${m.reach ? ` (seen ${Number(m.reach).toLocaleString("en-KE")} times)` : ""}${m.author ? ` by ${m.author}` : ""}\n  ${m.url}`,
        )
        .join("\n");

      const channel = alert.channel as string;
      let status = "staged";
      let detail: string | null = null;
      if (channel === "app") {
        status = "delivered";
      } else if (channel === "email") {
        try {
          const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
          const r = await sendTemplateEmail("campaign-message", alert.destination, {
            templateData: {
              campaignName: nameOf.get(campaignId) ?? "Groundwork",
              subject,
              body: `${body}\n\nOpen Listening in Groundwork to react.`,
              senderName: "Groundwork Listening",
            },
            idempotencyKey: `alert-${alert.id}-${matched[0].id}`,
            fromName: "Groundwork Listening",
          });
          status = r.sent ? "sent" : "failed";
          detail = r.sent ? null : "This address bounced or unsubscribed earlier.";
        } catch (e) {
          status = "failed";
          detail = e instanceof Error ? e.message.slice(0, 200) : "The email could not be sent.";
        }
      } else if (whatsappLive) {
        status = "queued";
      } else {
        detail = "Waiting on the WhatsApp Business number being switched live.";
      }

      const events = matched.slice(0, 10).map((m: any) => ({
        campaign_id: campaignId,
        alert_id: alert.id,
        mention_id: m.id,
        channel,
        destination: alert.destination,
        subject,
        body,
        status,
        detail,
      }));

      const { error } = await sb.from("listening_alert_events").insert(events);
      if (error) continue;

      await sb
        .from("listening_alerts")
        .update({ last_fired_at: new Date().toISOString() })
        .eq("id", alert.id);
      count += events.length;
    }
  }

  return count;
}
