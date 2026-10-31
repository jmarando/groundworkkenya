import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import {
  deleteAlert,
  deleteTopic,
  getListening,
  resumeListening,
  saveAlert,
  saveTopic,
  setMentionStatus,
  sweepListening,
  testAlert,
  toggleAlert,
  toggleTopic,
} from "@/lib/listening.functions";
import type { BriefFocus } from "@/lib/big-voices";
import { downloadCSV, stampName } from "@/lib/csv";
import { filterMentions } from "@/lib/listening-filter";
import { sweepProblems } from "@/lib/listening-health";
import { Overview, PostList } from "@/components/gw/listening/Overview";
import { SweepProblems } from "@/components/gw/listening/SweepProblems";
import { sourceName } from "@/lib/listening-read";
import { nf, stamp } from "@/lib/format";
import { QueryState } from "@/components/gw/QueryState";
import { Alerts, Keywords } from "@/components/gw/listening/Settings";
import { Reactions } from "@/components/gw/listening/Reactions";
import { ReplayPanel } from "@/components/gw/listening/ReplayPanel";
import { StoryPanel } from "@/components/gw/listening/StoryPanel";
import { StoryProvider } from "@/components/gw/listening/story-context";
import { Voices } from "@/components/gw/listening/Voices";
import { draftReaction } from "@/lib/rapid.functions";
import { SPREAD_DEFAULT } from "@/lib/voices";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/listening")({
  // ?issue=water: a link from Home opens the mentions about that issue. ?story=<id> opens a story.
  validateSearch: (search: Record<string, unknown>): { issue?: string; story?: string } => {
    const v =
      typeof search["issue"] === "string" ? search["issue"].trim().toLowerCase().slice(0, 40) : "";
    const story =
      typeof search["story"] === "string" && /^[0-9a-f-]{36}$/.test(search["story"])
        ? search["story"]
        : "";
    return { ...(v ? { issue: v } : {}), ...(story ? { story } : {}) };
  },
  component: Listening,
  head: () => ({
    meta: [
      { title: "Listening · Groundwork" },
      {
        name: "description",
        content:
          "News, blogs and social posts swept hourly, read for mood and issue, with keyword alerts to email and WhatsApp.",
      },
      { property: "og:title", content: "Listening · Groundwork" },
      {
        property: "og:description",
        content:
          "News, blogs and social posts swept hourly, read for mood and issue, with keyword alerts to email and WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const MOOD: Record<string, string> = { positive: "warm", neutral: "neutral", negative: "angry" };
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "voices", label: "Voices & platforms" },
  { key: "reactions", label: "Reactions" },
  { key: "replay", label: "Replay" },
  { key: "mentions", label: "All posts" },
  { key: "keywords", label: "Keywords" },
  { key: "alerts", label: "Alerts" },
] as const;

type Tab = (typeof TABS)[number]["key"];

function Listening() {
  const fetchData = useServerFn(getListening);
  const sweep = useServerFn(sweepListening);
  const resume = useServerFn(resumeListening);
  const upsertTopic = useServerFn(saveTopic);
  const flipTopic = useServerFn(toggleTopic);
  const dropTopic = useServerFn(deleteTopic);
  const upsertAlert = useServerFn(saveAlert);
  const flipAlert = useServerFn(toggleAlert);
  const dropAlert = useServerFn(deleteAlert);
  const fireTest = useServerFn(testAlert);
  const markMention = useServerFn(setMentionStatus);
  const draft = useServerFn(draftReaction);
  const [openReaction, setOpenReaction] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["listening"],
    queryFn: () => fetchData(),
  });

  const { issue, story } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [tab, setTab] = useState<Tab>(issue ? "mentions" : "overview");
  // A story opened from a link, a post or the address; it replaces the tab until closed.
  const [openStory, setOpenStory] = useState<string | null>(story ?? null);
  const showStory = (id: string | null) => {
    setOpenStory(id);
    void navigate({ search: id ? { story: id } : {}, replace: true });
  };
  // A story's Brief voices opens the Voices tab on its level and issue until cleared or left.
  const [briefFocus, setBriefFocus] = useState<BriefFocus | null>(null);
  const view = openStory ? null : tab;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [source, setSource] = useState("all");
  const [mood, setMood] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [search, setSearch] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["listening"] });

  /** Drafts a reaction to a post with the AI, then opens it under Reactions. */
  const react = data?.canReact
    ? (mentionId: string, storyId?: string) => {
        const t = toast.loading("Reading the post and drafting a reaction…");
        draft({ data: { mentionId, ...(storyId ? { storyId } : {}) } })
          .then(async ({ id }) => {
            toast.success("Reaction drafted.", { id: t });
            await queryClient.invalidateQueries({ queryKey: ["reactions"] });
            setOpenReaction(id);
            if (openStory) showStory(null);
            setTab("reactions");
          })
          .catch((e: Error) => toast.error(e.message, { id: t }));
      }
    : undefined;
  const threshold = Math.min(
    SPREAD_DEFAULT,
    ...(data?.alerts ?? []).filter((a) => a.active && a.minReach).map((a) => a.minReach!),
  );

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      await refresh();
      setNote(ok);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const mentions = useMemo(
    () =>
      filterMentions(data?.mentions ?? [], {
        source,
        mood,
        topic: topicFilter,
        search,
        issue: issue ?? null,
      }),
    [data, source, mood, topicFilter, search, issue],
  );

  const mark = (ids: string[], status: "new" | "actioned") =>
    act(
      () => markMention({ data: { ids, status } }),
      status === "actioned" ? `Marked ${ids.length} handled.` : "Reopened.",
    );

  const exportMentions = () =>
    downloadCSV(
      stampName("listening-mentions"),
      [
        "found",
        "published",
        "topic",
        "source",
        "domain",
        "title",
        "mood",
        "score",
        "issue",
        "status",
        "url",
      ],
      mentions.map((m) => [
        m.foundAt,
        m.publishedAt ?? "",
        m.topic ?? "",
        m.source,
        m.domain ?? "",
        m.title ?? "",
        m.sentiment ?? "unrated",
        m.sentimentScore ?? "",
        m.issue ?? "",
        m.status,
        m.url,
      ]),
    );

  return (
    <StoryProvider
      value={{
        open: showStory,
        title: (id) => data?.stories.find((x) => x.id === id)?.title,
      }}
    >
      <section className="view active" aria-label="Listening">
        <div className="vh fx">
          <div>
            <span className="eyebrow">Comms · listening</span>
            <h1>
              Everything said about you, <span className="serif">in one room.</span>
            </h1>
            <p className="meta">
              News, social posts and blogs, swept every hour and read for mood. Start with what
              needs you.
            </p>
          </div>
          <div className="vh-side">
            <span className="syncline">
              <span
                className={data?.job?.status === "paused" ? "dot-stale" : "dot-live"}
                aria-hidden="true"
              />{" "}
              {data?.job?.status === "paused"
                ? "sweeping paused"
                : `last sweep ${stamp(data?.job?.lastRunAt ?? null)}`}
            </span>
            {data?.job?.status === "paused" ? null : (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const r = await sweep({ data: {} });
                    if (!r.ran) throw new Error(r.notes[0] ?? "The sweep did not run.");
                  }, "Sweep finished.")
                }
              >
                {busy ? "Sweeping…" : "Sweep now"}
              </button>
            )}
          </div>
        </div>

        <QueryState
          isLoading={isLoading}
          isError={isError}
          retry={() => void refetch()}
          what="what was found"
        />

        <SweepProblems
          problems={sweepProblems({ job: data?.job ?? null, rivalJob: data?.rivalJob ?? null })}
          canRestart={data?.canRestart === true}
          busy={busy}
          restart={() => void act(() => resume(), "Sweeping restarted.")}
        />

        {note && (
          <p className="f-note" style={{ marginTop: 10 }}>
            {note}
          </p>
        )}

        <div className="fchips" style={{ marginTop: 14 }}>
          {TABS.map((x) => (
            <button
              type="button"
              key={x.key}
              className={`fchip${tab === x.key ? " active" : ""}`}
              aria-pressed={tab === x.key}
              onClick={() => {
                if (openStory) showStory(null);
                setBriefFocus(null);
                setTab(x.key);
              }}
            >
              {x.label}
            </button>
          ))}
        </div>

        {openStory && (
          <StoryPanel
            id={openStory}
            back={() => showStory(null)}
            react={react}
            brief={(focus) => {
              showStory(null);
              setBriefFocus(focus);
              setTab("voices");
            }}
          />
        )}

        {view === "overview" && (
          <Overview
            topics={data?.topics ?? []}
            mentions={data?.mentions ?? []}
            busy={busy}
            mark={mark}
            openKeywords={() => setTab("keywords")}
            react={react}
            threshold={threshold}
          />
        )}

        {view === "voices" && (
          <Voices
            mentions={data?.mentions ?? []}
            busy={busy}
            mark={mark}
            react={react}
            briefFocus={briefFocus}
            clearBriefFocus={() => setBriefFocus(null)}
          />
        )}

        {view === "reactions" && <Reactions openId={openReaction} />}

        {view === "replay" && <ReplayPanel busy={busy} mark={mark} react={react} />}

        {view === "mentions" && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head">
              <div>
                <h2>Every post found</h2>
                <p className="meta">
                  {nf.format(mentions.length)} shown of {nf.format(data?.mentions.length ?? 0)}.
                </p>
              </div>
              <button type="button" className="btn btn--sm" onClick={exportMentions}>
                Download CSV
              </button>
            </div>

            <div className="ibx-f" style={{ gap: 8, flexWrap: "wrap" }}>
              {issue ? (
                <button
                  type="button"
                  className="fchip active"
                  aria-label={`Showing ${issue} only. Show every issue`}
                  onClick={() => void navigate({ search: {} })}
                >
                  Issue: {issue} ×
                </button>
              ) : null}
              <input
                className="ibx-search"
                aria-label="Search headlines and text"
                placeholder="Search headlines and text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Keyword"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
              >
                <option value="all">All keywords</option>
                {(data?.topics ?? []).map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="all">All sources</option>
                {(data?.bySource ?? []).map((s) => (
                  <option key={s.source} value={s.source}>
                    {sourceName(s.source)}
                  </option>
                ))}
              </select>
              <select aria-label="Mood" value={mood} onChange={(e) => setMood(e.target.value)}>
                <option value="all">Any mood</option>
                <option value="negative">Angry</option>
                <option value="neutral">Neutral</option>
                <option value="positive">Warm</option>
                <option value="unrated">Not read yet</option>
              </select>
            </div>

            <PostList posts={mentions} busy={busy} mark={mark} react={react} />
          </div>
        )}

        {view === "keywords" && (
          <Keywords
            data={data}
            busy={busy}
            act={act}
            save={upsertTopic}
            flip={flipTopic}
            drop={dropTopic}
          />
        )}

        {view === "alerts" && (
          <Alerts
            data={data}
            busy={busy}
            act={act}
            save={upsertAlert}
            flip={flipAlert}
            drop={dropAlert}
            test={fireTest}
          />
        )}
      </section>
    </StoryProvider>
  );
}
