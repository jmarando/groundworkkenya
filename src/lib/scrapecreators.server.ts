/**
 * ScrapeCreators social-platform search (server only).
 *
 * Keyword search across TikTok, Reddit and YouTube for the listening sweep,
 * and each rival's own posts and comment pages for the daily rival sweep.
 * Best effort: a credit failure throws ScrapeCreatorsCreditError so the sweep
 * can note it and keep going instead of pausing everything.
 *
 * Docs: https://docs.scrapecreators.com — auth via the `x-api-key` header.
 */

import {
  commentTexts,
  facebookPosts,
  tiktokPosts,
  xPosts,
  type Platform,
  type SocialPost,
} from "./rival-posts";

export type Found = {
  url: string;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
};

export class ScrapeCreatorsCreditError extends Error {
  constructor(reason: string) {
    super(reason);
  }
}

const SC_BASE = "https://api.scrapecreators.com";

export function scConfigured(): boolean {
  return Boolean(process.env["SCRAPECREATORS_API_KEY"]);
}

async function scGet(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env["SCRAPECREATORS_API_KEY"];
  if (!key) throw new ScrapeCreatorsCreditError("ScrapeCreators key is not set.");

  const url = `${SC_BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { "x-api-key": key } });

  if (res.status === 402 || res.status === 403) {
    throw new ScrapeCreatorsCreditError("ScrapeCreators is out of credits.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ScrapeCreators ${path} failed (${res.status}): ${body.slice(0, 120)}`);
  }

  const json = await res.json();
  if (json?.success === false) {
    const msg = typeof json?.message === "string" ? json.message : "ScrapeCreators error";
    if (/credit/i.test(msg)) throw new ScrapeCreatorsCreditError(msg);
    throw new Error(`ScrapeCreators ${path}: ${msg.slice(0, 120)}`);
  }
  return json;
}

/* --------------------------------------------------------------- tiktok */

export async function scSearchTikTok(query: string, limit = 8): Promise<Found[]> {
  const json = await scGet("/v1/tiktok/search/keyword", { query });
  const items: any[] = json?.search_item_list ?? [];
  return items
    .map((it: any): Found => {
      const id = typeof it?.aweme_id === "string" ? it.aweme_id : "";
      const handle = it?.author?.unique_id || "-";
      const desc = typeof it?.desc === "string" ? it.desc : "";
      const url = id ? `https://www.tiktok.com/@${handle}/video/${id}` : (it?.share_url ?? "");
      return {
        url,
        title: desc.slice(0, 300) || null,
        snippet: desc.slice(0, 1200) || null,
        publishedAt: it?.create_time ? new Date(Number(it.create_time) * 1000).toISOString() : null,
      };
    })
    .filter((h) => Boolean(h.url))
    .slice(0, limit);
}

/* --------------------------------------------------------------- reddit */

export async function scSearchReddit(query: string, limit = 8): Promise<Found[]> {
  const json = await scGet("/v1/reddit/search", { query, filter: "posts", timeframe: "week", trim: "true" });
  const posts: any[] = json?.posts ?? [];
  return posts
    .map((p: any): Found => {
      const self = typeof p?.selftext === "string" ? p.selftext : "";
      return {
        url: p?.permalink ? `https://www.reddit.com${p.permalink}` : (p?.url ?? ""),
        title: (p?.title ?? "").slice(0, 300) || null,
        snippet: (self || p?.title || "").slice(0, 1200) || null,
        publishedAt: p?.created_utc ? new Date(Number(p.created_utc) * 1000).toISOString() : null,
      };
    })
    .filter((h) => Boolean(h.url))
    .slice(0, limit);
}

/* -------------------------------------------------------------- youtube */

export async function scSearchYouTube(query: string, limit = 8): Promise<Found[]> {
  const json = await scGet("/v1/youtube/search", { query, uploadDate: "week" });
  const items: any[] = [...(json?.videos ?? []), ...(json?.shorts ?? [])];
  return items
    .map((v: any): Found => ({
      url: v?.url ?? "",
      title: (v?.title ?? "").slice(0, 300) || null,
      snippet: null,
      publishedAt: typeof v?.publishedTime === "string" ? v.publishedTime : null,
    }))
    .filter((h) => Boolean(h.url))
    .slice(0, limit);
}

/* -------------------------------------------------------- rivals' posts */

/** A rival's recent posts on one platform. One request, one credit. */
export async function scRivalPosts(platform: Platform, handle: string): Promise<SocialPost[]> {
  if (platform === "tiktok") {
    const json: unknown = await scGet("/v3/tiktok/profile/videos", {
      handle,
      sort_by: "latest",
      trim: "true",
    });
    return tiktokPosts(json, handle);
  }
  if (platform === "x") {
    const json: unknown = await scGet("/v1/twitter/user-tweets", { handle, trim: "true" });
    return xPosts(json, handle);
  }
  const json: unknown = await scGet("/v1/facebook/profile/posts", {
    url: `https://www.facebook.com/${handle}`,
  });
  return facebookPosts(json);
}

/** One page of comments on a TikTok or Facebook post, and where the next page starts. */
export async function scCommentPage(
  platform: "tiktok" | "facebook",
  url: string,
  cursor?: string,
): Promise<{ texts: string[]; next: string | null }> {
  const path = platform === "tiktok" ? "/v1/tiktok/video/comments" : "/v1/facebook/post/comments";
  const json: unknown = await scGet(path, { url, ...(cursor ? { cursor } : {}) });
  const page = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const more = platform === "tiktok" ? Boolean(page["has_more"]) : Boolean(page["has_next_page"]);
  const c = page["cursor"];
  const next = more && c !== undefined && c !== null && c !== "" ? String(c) : null;
  return { texts: commentTexts(page), next };
}
