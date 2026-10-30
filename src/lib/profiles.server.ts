// The hourly follower lookups: for each campaign, the accounts that lead its columns (big voices
// with the floor off) whose follower count is missing or a week old, a few an hour from the day's
// "profiles" budget. A count is a public fact about a public account and goes in the shared
// listening_accounts table. Accounts seen with a count in X search results are saved free, with no
// lookup. Server only; nothing here records anything about a person.

import { bigVoices, rivalVoiceKeys, type BigVoice } from "@/lib/big-voices";
import { loadWindow } from "@/lib/listening-load.server";
import { toMention } from "@/lib/listening-mention";
import {
  lookupCandidates,
  profileRequest,
  readFollowers,
  type Known,
  type ProfileRequest,
} from "@/lib/profiles";
import { scConfigured, scProfile, ScrapeCreatorsCreditError } from "@/lib/scrapecreators.server";
import { takeCredits } from "@/lib/social-credits";

type AnyClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the service-role Supabase client, loosely
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

const PER_RUN = 6;
const DAY = 86_400_000;
const LABELS = { seat: "Seat", county: "County", country: "Country" };

export type Lookups = { ran: boolean; looked: number; failed: number; notes: string[] };
export type AccountRow = {
  voice_key: string;
  platform: string;
  name: string;
  url: string | null;
  followers: number | null;
};

/** Saves counts seen for free (an account with no count is skipped; the latest of a repeat wins). */
export async function saveAccounts(sb: AnyClient, rows: AccountRow[], at = new Date()) {
  const byKey = new Map<string, AccountRow>();
  for (const r of rows) if (r.followers !== null) byKey.set(r.voice_key, r);
  if (!byKey.size) return;
  try {
    await sb.from("listening_accounts").upsert(
      [...byKey.values()].map((r) => ({ ...r, checked_at: at.toISOString(), failed_at: null })),
      { onConflict: "voice_key" },
    );
  } catch {
    // Best effort.
  }
}

export async function runProfileLookups(
  sb: AnyClient,
  opts: { fetch?: (req: ProfileRequest) => Promise<unknown>; now?: number } = {},
): Promise<Lookups> {
  const lookup = opts.fetch ?? scProfile;
  if (!opts.fetch && !scConfigured())
    return { ran: false, looked: 0, failed: 0, notes: ["ScrapeCreators is not connected."] };
  const now = opts.now ?? Date.now();
  const stamp = new Date(now).toISOString();
  const out: Lookups = { ran: true, looked: 0, failed: 0, notes: [] };

  const [{ data: topics }, { data: accounts }, { data: rivals }] = await Promise.all([
    sb.from("listening_topics").select("id, campaign_id, label, kind, active"),
    sb.from("listening_accounts").select("voice_key, followers, checked_at, failed_at").limit(5000),
    sb.from("race_rivals").select("id, campaign_id, name, is_us, x, tiktok, facebook"),
  ]);
  const topicById = new Map(
    ((topics ?? []) as { id: string; label: string; kind: string }[]).map((t) => [t.id, t]),
  );
  const campaigns = [
    ...new Set(
      ((topics ?? []) as { campaign_id: string | null; active: boolean }[])
        .filter((t) => t.active && t.campaign_id)
        .map((t) => t.campaign_id as string),
    ),
  ];
  const known = new Map<string, Known>(
    (
      (accounts ?? []) as {
        voice_key: string;
        followers: number | null;
        checked_at: string | null;
        failed_at: string | null;
      }[]
    ).map((a) => [
      a.voice_key,
      { followers: a.followers, checkedAt: a.checked_at, failedAt: a.failed_at },
    ]),
  );

  // Who to ask about this hour, across campaigns, most worth first.
  const chosen = new Map<string, BigVoice>();
  for (const campaign of campaigns) {
    if (chosen.size >= PER_RUN) break;
    const mine = (
      (rivals ?? []) as {
        id: string;
        campaign_id: string;
        name: string;
        is_us: boolean | null;
        x: string | null;
        tiktok: string | null;
        facebook: string | null;
      }[]
    ).filter((r) => r.campaign_id === campaign);
    const rivalById = new Map(mine.map((r) => [r.id, r]));
    const { rows } = await loadWindow(sb, {
      since: new Date(now - 30 * DAY).toISOString(),
      campaignId: campaign,
      cap: 1000,
    });
    const columns = bigVoices(
      rows.map((r) => toMention(r, topicById, rivalById)),
      {
        now,
        followers: new Map(),
        rivalKeys: rivalVoiceKeys(mine),
        labels: LABELS,
        floor: false,
        accounts: 1000,
      },
    );
    const byKey = new Map(columns.flatMap((c) => c.accounts).map((v) => [v.key, v]));
    for (const key of lookupCandidates(columns, known, now, PER_RUN)) {
      if (chosen.size >= PER_RUN) break;
      const voice = byKey.get(key);
      if (voice && !chosen.has(key)) chosen.set(key, voice);
    }
  }

  for (const [key, voice] of chosen) {
    const request = profileRequest(key);
    if (!request) continue;
    if (!(await takeCredits(sb, "profiles", 1))) {
      out.notes.push("Today's profile lookups are used.");
      break;
    }
    const base = { voice_key: key, platform: voice.platform, name: voice.name, url: voice.url };
    try {
      const followers = readFollowers(await lookup(request));
      if (followers === null) throw new Error(`${voice.name}: the answer held no follower count.`);
      await sb
        .from("listening_accounts")
        .upsert(
          { ...base, followers, checked_at: stamp, failed_at: null },
          { onConflict: "voice_key" },
        );
      out.looked++;
    } catch (e) {
      if (e instanceof ScrapeCreatorsCreditError) {
        out.notes.push(e.message);
        break;
      }
      out.failed++;
      out.notes.push(e instanceof Error ? e.message : `${voice.name}: the lookup failed.`);
      await sb
        .from("listening_accounts")
        .upsert({ ...base, failed_at: stamp }, { onConflict: "voice_key" });
    }
  }
  return out;
}
