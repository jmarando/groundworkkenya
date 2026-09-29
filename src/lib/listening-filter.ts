// Which of Listening's mentions to show, from the filters on the Mentions tab
// and the issue a link from Home asks for.

export type MentionLike = {
  source: string;
  sentiment: string | null;
  topicId: string | null;
  title: string | null;
  snippet: string | null;
  domain: string | null;
  issue: string | null;
};

export type MentionFilter = {
  source: string;
  mood: string;
  topic: string;
  search: string;
  /** Lowercase issue label, or null for every issue. */
  issue: string | null;
};

export function filterMentions<T extends MentionLike>(ms: T[], f: MentionFilter): T[] {
  const q = f.search.trim().toLowerCase();
  return ms.filter((m) => {
    if (f.source !== "all" && m.source !== f.source) return false;
    if (f.mood !== "all" && (m.sentiment ?? "unrated") !== f.mood) return false;
    if (f.topic !== "all" && m.topicId !== f.topic) return false;
    if (f.issue && (m.issue ?? "").trim().toLowerCase() !== f.issue) return false;
    if (q && !`${m.title ?? ""} ${m.snippet ?? ""} ${m.domain ?? ""}`.toLowerCase().includes(q))
      return false;
    return true;
  });
}
