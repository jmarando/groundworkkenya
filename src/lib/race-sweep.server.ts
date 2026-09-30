// The daily read of each candidate's own posts on TikTok, X and Facebook
// (server only). Posts become mentions tied to the rival. For each rival's two
// most-engaged new TikTok or Facebook posts, up to 50 comments are read and
// their moods counted; the comments, and who wrote them, are never kept. Every
// ScrapeCreators request comes out of the day's "rivals" budget.

import { askAiJson } from "@/lib/listening.server";
import { tally, type Platform, type SocialPost } from "@/lib/rival-posts";
import {
  scCommentPage,
  scConfigured,
  scRivalPosts,
  ScrapeCreatorsCreditError,
} from "@/lib/scrapecreators.server";
import { takeCredits } from "@/lib/social-credits";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type Rival = {
  id: string;
  campaign_id: string;
  name: string;
  facebook: string | null;
  x: string | null;
  tiktok: string | null;
};

const JOB_KEY = "race_social";
const EVERY_HOURS = 20;
const NEW_POST_DAYS = 3;
const POSTS_TO_READ = 2;
const COMMENT_PAGES = 3;
const COMMENTS = 50;

export type RivalSweep = {
  ran: boolean;
  requests: number;
  posts: number;
  commentsRead: number;
  notes: string[];
};

const LANDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "sentiment", "issue"],
        properties: {
          i: { type: "integer" },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
          issue: { type: "string" },
        },
      },
    },
  },
};

/** How comments on one of the rival's posts landed: counts only. */
async function landing(texts: string[], rival: string) {
  const prompt = [
    `These are public comments on a post by ${rival}, a candidate for office in Kenya.`,
    "Text may mix English, Kiswahili and Sheng. For each comment say whether it is positive,",
    `neutral or negative towards ${rival}, and give a short lowercase issue label (roads, water,`,
    "garbage, jobs, bursaries, security, health, housing, corruption, transport, land, general).",
    "Keep each comment's number as i.",
    "",
    JSON.stringify(texts.map((t, i) => ({ i, text: t.slice(0, 300) }))),
  ].join("\n");
  const answer = await askAiJson<{ results?: { i: number; sentiment: string; issue: string }[] }>(
    prompt,
    "comment_moods",
    LANDING_SCHEMA,
  );
  const seen = new Set<number>();
  const verdicts = (answer.results ?? []).filter((v) => {
    if (!Number.isInteger(v.i) || v.i < 0 || v.i >= texts.length || seen.has(v.i)) return false;
    seen.add(v.i);
    return true;
  });
  return tally(verdicts);
}

export async function runRivalSweep(
  sb: Client,
  opts: { now?: Date; force?: boolean } = {},
): Promise<RivalSweep> {
  const now = opts.now ?? new Date();
  const out: RivalSweep = { ran: false, requests: 0, posts: 0, commentsRead: 0, notes: [] };
  const { data: job } = await sb
    .from("listening_jobs")
    .select("*")
    .eq("key", JOB_KEY)
    .maybeSingle();
  if (
    !opts.force &&
    job?.last_run_at &&
    now.getTime() - Date.parse(job.last_run_at) < EVERY_HOURS * 3600_000
  )
    return out;
  if (!opts.force && job?.locked_until && Date.parse(job.locked_until) > now.getTime()) return out;
  out.ran = true;

  const finish = async () => {
    const detail =
      out.notes.join(" · ").slice(0, 400) ||
      `Read ${out.posts} posts and ${out.commentsRead} comments.`;
    await sb.from("listening_jobs").upsert(
      {
        key: JOB_KEY,
        status: "idle",
        locked_until: null,
        last_run_at: now.toISOString(),
        detail,
        updated_at: now.toISOString(),
      },
      { onConflict: "key" },
    );
    return out;
  };

  if (!scConfigured()) {
    out.notes.push("ScrapeCreators is not connected, so rivals' posts are not being read.");
    return finish();
  }
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "running",
      locked_until: new Date(now.getTime() + 15 * 60_000).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );

  // Stops for good once the day's budget is spent or ScrapeCreators has no credits.
  let stop = false;
  const spend = async () => {
    if (stop) return false;
    if (!(await takeCredits(sb, "rivals", 1))) {
      stop = true;
      out.notes.push("Stopped at today's ScrapeCreators limit for rivals.");
      return false;
    }
    out.requests++;
    return true;
  };
  const outOfCredits = () => {
    stop = true;
    out.notes.push("ScrapeCreators is out of credits.");
  };

  const since = now.getTime() - NEW_POST_DAYS * 864e5;
  const { data: rivals } = await sb
    .from("race_rivals")
    .select("id, campaign_id, name, facebook, x, tiktok");

  for (const r of (rivals ?? []) as Rival[]) {
    if (stop) break;
    for (const platform of ["tiktok", "x", "facebook"] as Platform[]) {
      const handle = r[platform];
      if (!handle || !(await spend())) continue;
      let posts: SocialPost[];
      try {
        posts = await scRivalPosts(platform, handle);
      } catch (err) {
        if (err instanceof ScrapeCreatorsCreditError) outOfCredits();
        else out.notes.push(`${r.name} on ${platform}: ${(err as Error).message}`);
        continue;
      }
      const fresh = posts.filter((p) => p.publishedAt && Date.parse(p.publishedAt) >= since);
      if (!fresh.length) continue;
      const { data: saved, error } = await sb
        .from("listening_mentions")
        .upsert(
          fresh.map((p) => ({
            campaign_id: r.campaign_id,
            rival_id: r.id,
            source: p.platform,
            author: r.name,
            url: p.url,
            title: p.text.slice(0, 300) || null,
            snippet: p.text.slice(0, 1200) || null,
            published_at: p.publishedAt,
            reach: p.reach,
          })),
          { onConflict: "campaign_id,url" },
        )
        .select("id");
      if (error) out.notes.push(`${r.name}: posts could not be stored (${error.message}).`);
      out.posts += saved?.length ?? 0;
    }

    // How the rival's two most-engaged new posts landed (X replies can't be read).
    const { data: toRead } = await sb
      .from("listening_mentions")
      .select("id, url, source")
      .eq("rival_id", r.id)
      .in("source", ["tiktok", "facebook"])
      .is("comments_read", null)
      .gte("published_at", new Date(since).toISOString())
      .order("reach", { ascending: false })
      .limit(POSTS_TO_READ);
    for (const m of (toRead ?? []) as {
      id: string;
      url: string;
      source: "tiktok" | "facebook";
    }[]) {
      const texts: string[] = [];
      let pages = 0;
      let cursor: string | undefined;
      while (pages < COMMENT_PAGES && texts.length < COMMENTS && (await spend())) {
        try {
          const got = await scCommentPage(m.source, m.url, cursor);
          pages++;
          texts.push(...got.texts);
          if (!got.next) break;
          cursor = got.next;
        } catch (err) {
          if (err instanceof ScrapeCreatorsCreditError) outOfCredits();
          else out.notes.push(`${r.name}'s comments: ${(err as Error).message}`);
          break;
        }
      }
      // Nothing fetched (budget spent): leave the post to be read another day.
      if (!pages) continue;
      const read = texts.slice(0, COMMENTS);
      let moods: { positive: number | null; negative: number | null; issue: string | null } = {
        positive: null,
        negative: null,
        issue: null,
      };
      if (read.length) {
        try {
          moods = await landing(read, r.name);
        } catch (err) {
          out.notes.push(
            `${r.name}'s comments could not be read for mood: ${(err as Error).message}`,
          );
        }
      }
      await sb
        .from("listening_mentions")
        .update({
          comments_read: read.length,
          comments_positive: moods.positive,
          comments_negative: moods.negative,
          comments_issue: moods.issue,
        })
        .eq("id", m.id);
      out.commentsRead += read.length;
    }
  }
  return finish();
}
