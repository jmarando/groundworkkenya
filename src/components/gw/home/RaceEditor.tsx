import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { nairobiToday } from "@/lib/demo/insights";
import { cleanPoll, RIVAL_TONES, type RaceRival } from "@/lib/race-data";
import { removePoll, removeRival, savePoll, saveRival } from "@/lib/race.functions";

const TONE_NAMES: Record<string, string> = { a: "Blue", b: "Green", c: "Yellow", d: "Pink" };

/** Everything on Home belongs to the race as it was; read it again after a change. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["home"] });
}

export function useRemovePoll(): (id: string) => void {
  const remove = useServerFn(removePoll);
  const refresh = useRefresh();
  const m = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Poll removed.");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (id) => m.mutate(id);
}

export function EditRivals({ rivals, onClose }: { rivals: RaceRival[]; onClose: () => void }) {
  const used = new Set(rivals.map((r) => r.tone));
  const nextTone = RIVAL_TONES.find((t) => !used.has(t)) ?? "a";
  const hasUs = rivals.some((r) => r.isUs);
  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="er-title">
      <div className="pb">
        <div className="pb-head">
          <div>
            <span className="eyebrow">The race · candidates</span>
            <h2 id="er-title">Who&apos;s running</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body re-list">
          {rivals.map((r) => (
            <RivalForm key={r.id} rival={r} canBeUs={r.isUs || !hasUs} />
          ))}
          <RivalForm
            key={`new-${rivals.length}`}
            rival={null}
            defaultTone={nextTone}
            canBeUs={!hasUs}
          />
        </div>
      </div>
    </div>
  );
}

function RivalForm({
  rival,
  defaultTone = "a",
  canBeUs,
}: {
  rival: RaceRival | null;
  defaultTone?: string;
  canBeUs: boolean;
}) {
  const [name, setName] = useState(rival?.name ?? "");
  const [party, setParty] = useState(rival?.party ?? "");
  const [office, setOffice] = useState(rival?.office ?? "");
  const [isUs, setIsUs] = useState(rival?.isUs ?? false);
  const [tone, setTone] = useState<string>(rival && !rival.isUs ? rival.tone : defaultTone);
  const [x, setX] = useState(rival?.x ?? "");
  const [tiktok, setTiktok] = useState(rival?.tiktok ?? "");
  const [facebook, setFacebook] = useState(rival?.facebook ?? "");
  const [sure, setSure] = useState(false);
  const save = useServerFn(saveRival);
  const remove = useServerFn(removeRival);
  const refresh = useRefresh();

  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: rival?.id ?? null,
          name,
          party,
          office,
          isUs,
          tone,
          sort: rival?.sort ?? 9,
          x,
          tiktok,
          facebook,
        },
      }),
    onSuccess: async () => {
      toast.success(`${name.trim()} saved.`);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removing = useMutation({
    mutationFn: () => remove({ data: { id: rival!.id } }),
    onSuccess: async () => {
      toast.success(`${rival!.name} removed.`);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="re-row"
      aria-label={rival ? rival.name : "Add a candidate"}
      onSubmit={(e) => {
        e.preventDefault();
        saving.mutate();
      }}
    >
      {!rival && <span className="eyebrow">Add a candidate</span>}
      <div className="pb-row pb-row--2">
        <label className="pb-field">
          <span>Name</span>
          <input
            value={name}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="pb-field">
          <span>Party</span>
          <input
            value={party}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setParty(e.target.value)}
          />
        </label>
      </div>
      <div className="pb-row pb-row--2">
        <label className="pb-field">
          <span>Office or base</span>
          <input
            value={office}
            maxLength={80}
            placeholder="Embakasi East MP"
            autoComplete="off"
            onChange={(e) => setOffice(e.target.value)}
          />
        </label>
        <label className="pb-field">
          <span>Colour</span>
          <select
            value={isUs ? "us" : tone}
            disabled={isUs}
            onChange={(e) => setTone(e.target.value)}
          >
            {isUs && <option value="us">Ours</option>}
            {RIVAL_TONES.map((t) => (
              <option key={t} value={t}>
                {TONE_NAMES[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {canBeUs && (
        <label className="re-check">
          <input type="checkbox" checked={isUs} onChange={(e) => setIsUs(e.target.checked)} /> This
          is our candidate
        </label>
      )}
      <div className="pb-row">
        <label className="pb-field">
          <span>X handle</span>
          <input
            value={x}
            placeholder="@handle"
            autoComplete="off"
            onChange={(e) => setX(e.target.value)}
          />
        </label>
        <label className="pb-field">
          <span>TikTok</span>
          <input
            value={tiktok}
            placeholder="@handle"
            autoComplete="off"
            onChange={(e) => setTiktok(e.target.value)}
          />
        </label>
        <label className="pb-field">
          <span>Facebook page</span>
          <input
            value={facebook}
            placeholder="Page name or link"
            autoComplete="off"
            onChange={(e) => setFacebook(e.target.value)}
          />
        </label>
      </div>
      <div className="re-actions">
        {rival && (
          <button
            type="button"
            className={`btn btn--ghost btn--sm home-remove${sure ? " is-sure" : ""}`}
            onClick={() => (sure ? removing.mutate() : setSure(true))}
            onBlur={() => setSure(false)}
            disabled={removing.isPending}
          >
            {sure ? `Remove ${rival.name}?` : "Remove"}
          </button>
        )}
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={saving.isPending || !name.trim()}
        >
          {rival ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

type Other = { name: string; share: string };

export function AddPoll({ rivals, onClose }: { rivals: RaceRival[]; onClose: () => void }) {
  const [pollster, setPollster] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [published, setPublished] = useState("");
  const [sample, setSample] = useState("");
  const [margin, setMargin] = useState("");
  const [url, setUrl] = useState("");
  const [shares, setShares] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Other[]>([{ name: "", share: "" }]);
  const [undecided, setUndecided] = useState("");
  const [approval, setApproval] = useState("");
  const [disapproval, setDisapproval] = useState("");
  const save = useServerFn(savePoll);
  const refresh = useRefresh();

  const input = {
    pollster,
    fieldworkFrom: from || null,
    fieldworkTo: to || null,
    publishedOn: published,
    sampleSize: sample,
    margin,
    sourceUrl: url,
    shares: [
      ...rivals.map((r) => ({ rivalId: r.id, name: r.name, share: shares[r.id] ?? "" })),
      ...others,
    ],
    undecided,
    approval,
    disapproval,
  };
  // The server checks again; this only says what is missing before it is sent.
  let problem: string | null = null;
  try {
    cleanPoll(input, rivals, nairobiToday());
  } catch (e) {
    problem = (e as Error).message;
  }

  const saving = useMutation({
    mutationFn: () => save({ data: input }),
    onSuccess: async () => {
      toast.success(`${pollster.trim()}'s poll added.`);
      await refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="ap-poll-title">
      <form
        className="pb"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <div className="pb-head">
          <div>
            <span className="eyebrow">The race · add a poll</span>
            <h2 id="ap-poll-title">A published poll, as published.</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body">
          <div className="pb-row pb-row--2">
            <label className="pb-field">
              <span>Pollster</span>
              <input
                value={pollster}
                maxLength={80}
                placeholder="Mizani Africa"
                onChange={(e) => setPollster(e.target.value)}
              />
            </label>
            <label className="pb-field">
              <span>Link to where it was published</span>
              <input
                value={url}
                inputMode="url"
                placeholder="https://…"
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
          </div>
          <div className="pb-row">
            <label className="pb-field">
              <span>Fieldwork from</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="pb-field">
              <span>Fieldwork to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="pb-field">
              <span>Published</span>
              <input type="date" value={published} onChange={(e) => setPublished(e.target.value)} />
            </label>
          </div>
          <div className="pb-row pb-row--2">
            <label className="pb-field">
              <span>People asked</span>
              <input
                value={sample}
                inputMode="numeric"
                placeholder="1820"
                onChange={(e) => setSample(e.target.value)}
              />
            </label>
            <label className="pb-field">
              <span>Margin of error (±)</span>
              <input
                value={margin}
                inputMode="decimal"
                placeholder="2.3"
                onChange={(e) => setMargin(e.target.value)}
              />
            </label>
          </div>
          <fieldset className="pb-field">
            <legend>Shares (%): leave a candidate blank if the poll left them out</legend>
            <div className="re-shares">
              {rivals.map((r) => (
                <label key={r.id} className="pb-field">
                  <span>
                    <i className={`mb-swatch mb-swatch--${r.tone}`} aria-hidden="true" /> {r.name}
                  </span>
                  <input
                    value={shares[r.id] ?? ""}
                    inputMode="decimal"
                    onChange={(e) => setShares({ ...shares, [r.id]: e.target.value })}
                  />
                </label>
              ))}
              <label className="pb-field">
                <span>Undecided</span>
                <input
                  value={undecided}
                  inputMode="decimal"
                  onChange={(e) => setUndecided(e.target.value)}
                />
              </label>
            </div>
          </fieldset>
          <fieldset className="pb-field">
            <legend>Other candidates the poll named</legend>
            {others.map((o, i) => (
              <div key={i} className="pb-row pb-row--2">
                <label className="pb-field">
                  <input
                    aria-label={`Other candidate ${i + 1}: name`}
                    value={o.name}
                    placeholder="Name"
                    onChange={(e) =>
                      setOthers(
                        others.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <label className="pb-field">
                  <input
                    aria-label={`Other candidate ${i + 1}: share`}
                    value={o.share}
                    inputMode="decimal"
                    placeholder="%"
                    onChange={(e) =>
                      setOthers(
                        others.map((x, j) => (j === i ? { ...x, share: e.target.value } : x)),
                      )
                    }
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setOthers([...others, { name: "", share: "" }])}
            >
              Add another name
            </button>
          </fieldset>
          <div className="pb-row pb-row--2">
            <label className="pb-field">
              <span>Approval of the sitting holder (%)</span>
              <input
                value={approval}
                inputMode="decimal"
                onChange={(e) => setApproval(e.target.value)}
              />
            </label>
            <label className="pb-field">
              <span>Disapproval (%)</span>
              <input
                value={disapproval}
                inputMode="decimal"
                onChange={(e) => setDisapproval(e.target.value)}
              />
            </label>
          </div>
          {problem && pollster.trim() ? <p className="re-problem">{problem}</p> : null}
        </div>
        <div className="pb-foot">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={Boolean(problem) || saving.isPending}
          >
            Add the poll
          </button>
        </div>
      </form>
    </div>
  );
}
