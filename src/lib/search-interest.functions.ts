// The week's issues from a campaign's own records, and its latest reads of
// search interest. Read with the signed-in person's client, where row level
// security keeps each campaign to its own, or by the server for one campaign.

import { searchFromRow, type SearchRead } from "@/lib/search-interest";
import type { MindInputs } from "@/lib/top-of-mind";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
};

/** One campaign's rows with its id; the signed-in person's own without. */
const ownCampaign =
  (campaignId: string | null) =>
  <T>(q: T): T =>
    campaignId
      ? (q as unknown as { eq: (c: string, v: string) => T }).eq("campaign_id", campaignId)
      : q;

/** What was raised since `since`: in the news (rivals' own posts aside), in messages, at the door. */
export async function loadMindInputs(
  sb: Client,
  campaignId: string | null,
  since: string,
): Promise<Omit<MindInputs, "searches">> {
  const own = ownCampaign(campaignId);
  const [news, messages, door] = await Promise.all([
    own(
      sb
        .from("listening_mentions")
        .select("issue, title, url")
        .is("rival_id", null)
        .gte("found_at", since),
    )
      .order("found_at", { ascending: false })
      .limit(2000),
    own(
      sb
        .from("conversations")
        .select("issue")
        .not("issue", "is", null)
        .gte("last_message_at", since),
    ).limit(2000),
    own(
      sb.from("person_events").select("detail").eq("kind", "door_spoke").gte("created_at", since),
    ).limit(5000),
  ]);
  return {
    news: (news.data ?? []) as MindInputs["news"],
    messages: ((messages.data ?? []) as { issue: string | null }[]).map((r) => r.issue),
    door: ((door.data ?? []) as { detail: string | null }[]).map((r) => r.detail),
  };
}

/** The newest read of `kind`, or null. */
export async function loadSearch(
  sb: Client,
  kind: "candidates" | "issues",
  campaignId: string | null = null,
): Promise<SearchRead | null> {
  const { data } = await ownCampaign(campaignId)(
    sb.from("search_interest").select("day, kind, geo, series, created_at").eq("kind", kind),
  )
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? searchFromRow(data) : null;
}
