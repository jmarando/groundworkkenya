// A post Listening kept, as the screens read it. One place turns a stored row into a Mention, so
// the Listening page and the posts-by-date read agree. Pure.

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
  /** The keyword's kind (campaign, rival, issue); null for a candidate's own post. */
  topicKind: string | null;
  rivalId: string | null;
  /** The candidate whose own account the post came from. */
  rival: string | null;
  rivalIsUs: boolean;
  author: string | null;
  reach: number | null;
  shares: number | null;
  commentsRead: number | null;
  commentsPositive: number | null;
  commentsNegative: number | null;
  /** The story the post belongs to, once the hourly job has found one. */
  storyId: string | null;
};

/** The columns of `listening_mentions` a Mention is read from. */
export type MentionRow = {
  id: string;
  topic_id: string | null;
  source: string;
  domain: string | null;
  title: string | null;
  url: string;
  snippet: string | null;
  published_at: string | null;
  found_at: string;
  sentiment: string | null;
  sentiment_score: number | string | null;
  issue: string | null;
  status: string;
  rival_id?: string | null;
  author?: string | null;
  reach?: number | string | null;
  shares?: number | string | null;
  comments_read?: number | null;
  comments_positive?: number | null;
  comments_negative?: number | null;
  story_id?: string | null;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function toMention(
  m: MentionRow,
  topicById: Map<string, { label: string; kind: string }>,
  rivalById: Map<string, { name: string; is_us: boolean | null }>,
): Mention {
  return {
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
    sentimentScore: num(m.sentiment_score),
    issue: m.issue,
    status: m.status,
    topicKind: m.topic_id ? (topicById.get(m.topic_id)?.kind ?? null) : null,
    rivalId: m.rival_id ?? null,
    rival: m.rival_id ? (rivalById.get(m.rival_id)?.name ?? null) : null,
    rivalIsUs: m.rival_id ? Boolean(rivalById.get(m.rival_id)?.is_us) : false,
    author: m.author ?? null,
    reach: num(m.reach),
    shares: num(m.shares),
    commentsRead: m.comments_read ?? null,
    commentsPositive: m.comments_positive ?? null,
    commentsNegative: m.comments_negative ?? null,
    storyId: m.story_id ?? null,
  };
}
