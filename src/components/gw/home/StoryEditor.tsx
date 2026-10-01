import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { cleanTeamStory, type StoryView } from "@/lib/morning-story";
import { reviseStory, saveStory } from "@/lib/morning-story.functions";

/** The candidate or manager edits this morning's story, picks another, or writes their own. */
export function StoryEditor({ view, onClose }: { view: StoryView | null; onClose: () => void }) {
  const s = view?.story ?? null;
  const [headline, setHeadline] = useState(s?.headline ?? "");
  const [summary, setSummary] = useState(s?.summary ?? "");
  const [why, setWhy] = useState(s?.why ?? "");
  const [rivals, setRivals] = useState(s?.rivals ?? "");
  const [line, setLine] = useState(s?.line ?? "");
  const [links, setLinks] = useState("");
  const save = useServerFn(saveStory);
  const revise = useServerFn(reviseStory);
  const queryClient = useQueryClient();
  const done = async (message: string) => {
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: ["home"] });
    onClose();
  };

  const input = {
    headline,
    summary,
    why,
    rivals,
    line,
    links: links.split(/\s+/).filter(Boolean),
  };
  // The server checks again; this only says what is missing before it is sent.
  let problem: string | null = null;
  try {
    cleanTeamStory(input, s);
  } catch (e) {
    problem = (e as Error).message;
  }
  const saving = useMutation({
    mutationFn: () => save({ data: input }),
    onSuccess: () => done("This morning's story is saved."),
    onError: (e: Error) => toast.error(e.message),
  });
  const rewriting = useMutation({
    mutationFn: (url: string) => revise({ data: { url } }),
    onSuccess: () => done("The story is rewritten around that one."),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="se-title">
      <form
        className="pb re-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <div className="pb-head">
          <div>
            <span className="eyebrow">Today · the story</span>
            <h2 id="se-title">{s ? "This morning's story" : "Write today's story"}</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body">
          <label className="pb-field">
            <span>Headline</span>
            <input value={headline} maxLength={160} onChange={(e) => setHeadline(e.target.value)} />
          </label>
          <label className="pb-field">
            <span>What happened</span>
            <textarea
              value={summary}
              maxLength={800}
              rows={3}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label className="pb-field">
            <span>Why it matters for the race</span>
            <textarea
              value={why}
              maxLength={400}
              rows={2}
              onChange={(e) => setWhy(e.target.value)}
            />
          </label>
          <label className="pb-field">
            <span>How rivals are playing it</span>
            <textarea
              value={rivals}
              maxLength={400}
              rows={2}
              onChange={(e) => setRivals(e.target.value)}
            />
          </label>
          <label className="pb-field">
            <span>Suggested line</span>
            <textarea
              value={line}
              maxLength={300}
              rows={2}
              onChange={(e) => setLine(e.target.value)}
            />
          </label>
          <label className="pb-field">
            <span>Links (https, one per line; blank keeps the story&apos;s own)</span>
            <textarea value={links} rows={2} onChange={(e) => setLinks(e.target.value)} />
          </label>
          {problem && headline.trim() ? <p className="re-problem">{problem}</p> : null}
          {s?.picks.length ? (
            <fieldset className="pb-field">
              <legend>Or write it around another of the morning&apos;s stories</legend>
              <ul className="se-picks">
                {s.picks.map((p) => (
                  <li key={p.url}>
                    <span>
                      <b>{p.title}</b> <small className="dim">{p.source}</small>
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={rewriting.isPending}
                      onClick={() => rewriting.mutate(p.url)}
                    >
                      Use this one
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
        </div>
        <div className="pb-foot">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={Boolean(problem) || saving.isPending}
          >
            Save the story
          </button>
        </div>
      </form>
    </div>
  );
}
