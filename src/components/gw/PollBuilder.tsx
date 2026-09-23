import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  REWARD_MAX_KES,
  validateDraft,
  type PollKind,
  type PollLang,
  type RewardMethod,
} from "@/lib/polls.engine";
import { createPoll, estimateAudience, getAudienceOptions } from "@/lib/polls.functions";

const CHANNELS: { id: string; label: string; note: string }[] = [
  { id: "sms", label: "SMS", note: "Any handset. Replies come back as 1–9." },
  { id: "ussd", label: "USSD", note: "Dial-in menu. No data or credit needed." },
  { id: "web", label: "Web link", note: "A /p/ link to share in WhatsApp groups." },
  { id: "wa", label: "WhatsApp", note: "Off until the Business number is live." },
];

type Option = { label: string; labelSw: string };

const nf = new Intl.NumberFormat("en-KE");

export function PollBuilder({ onClose }: { onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [questionSw, setQuestionSw] = useState("");
  const [kind, setKind] = useState<PollKind>("single_choice");
  const [lang, setLang] = useState<PollLang>("sw");
  const [options, setOptions] = useState<Option[]>([
    { label: "", labelSw: "" },
    { label: "", labelSw: "" },
  ]);
  const [channels, setChannels] = useState<string[]>(["sms"]);
  const [segments, setSegments] = useState<string[]>([]);
  const [wardIds, setWardIds] = useState<string[]>([]);
  const [wardFilter, setWardFilter] = useState("");
  const [sampleTarget, setSampleTarget] = useState("");
  const [rewardMethod, setRewardMethod] = useState<RewardMethod>("none");
  const [rewardAmount, setRewardAmount] = useState("");
  const [closesInDays, setClosesInDays] = useState("3");

  const fetchOptions = useServerFn(getAudienceOptions);
  const fetchEstimate = useServerFn(estimateAudience);
  const save = useServerFn(createPoll);
  const queryClient = useQueryClient();

  const { data: audience } = useQuery({
    queryKey: ["poll-audience-options"],
    queryFn: () => fetchOptions(),
  });

  const { data: estimate } = useQuery({
    queryKey: ["poll-audience-estimate", [...wardIds].sort(), [...segments].sort()],
    queryFn: () => fetchEstimate({ data: { wardIds, segments } }),
    placeholderData: keepPreviousData,
  });

  // Yes/No polls get their two options filled in and fixed.
  const effectiveOptions: Option[] =
    kind === "yesno"
      ? [
          { label: "Yes", labelSw: "Ndio" },
          { label: "No", labelSw: "Hapana" },
        ]
      : options;

  const problem =
    !question.trim() && questionSw.trim()
      ? "Add the English wording too: results and exports use it."
      : validateDraft({
          question,
          kind,
          options: effectiveOptions,
          channels,
          rewardMethod,
          rewardAmount: Number(rewardAmount) || 0,
        });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          question,
          questionSw,
          kind,
          lang,
          options: kind === "open" ? [] : effectiveOptions,
          channels,
          wardIds,
          segments,
          sampleTarget: Number(sampleTarget) || 0,
          rewardMethod,
          rewardAmount: Number(rewardAmount) || 0,
          closesInDays: Number(closesInDays) || 3,
        },
      }),
    onSuccess: async (r) => {
      toast.success(`Saved as draft ${r.code}. Launch it from its card when you're ready.`);
      await queryClient.invalidateQueries({ queryKey: ["polling"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const wards = useMemo(() => {
    const q = wardFilter.trim().toLowerCase();
    const all = audience?.wards ?? [];
    return q ? all.filter((w) => `${w.name} ${w.constituency}`.toLowerCase().includes(q)) : all;
  }, [audience, wardFilter]);

  const cap = Number(sampleTarget) || 0;
  const reach = estimate?.reachable ?? 0;
  const willText = cap > 0 ? Math.min(cap, reach) : reach;

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="pb-title">
      <div className="pb">
        <div className="pb-head">
          <div>
            <span className="eyebrow">Polling · new draft</span>
            <h2 id="pb-title">Ask one clear question.</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="pb-body">
          <div className="pb-row pb-row--2">
            <label className="pb-field">
              <span>Question · Kiswahili</span>
              <textarea
                rows={2}
                maxLength={300}
                value={questionSw}
                placeholder="Ni jambo gani moja kaunti inapaswa kurekebisha kwanza?"
                onChange={(e) => setQuestionSw(e.target.value)}
              />
            </label>
            <label className="pb-field">
              <span>Question · English</span>
              <textarea
                rows={2}
                maxLength={300}
                value={question}
                placeholder="Which one thing should the county fix first?"
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
          </div>

          <div className="pb-row">
            <label className="pb-field">
              <span>Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as PollKind)}>
                <option value="single_choice">Choose one</option>
                <option value="yesno">Yes / No</option>
                <option value="open">Open answer</option>
              </select>
            </label>
            <label className="pb-field">
              <span>Send in</span>
              <select value={lang} onChange={(e) => setLang(e.target.value as PollLang)}>
                <option value="sw">Kiswahili</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="pb-field">
              <span>Closes after</span>
              <select value={closesInDays} onChange={(e) => setClosesInDays(e.target.value)}>
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
              </select>
            </label>
          </div>

          {kind === "single_choice" && (
            <fieldset className="pb-field">
              <legend>Options · people reply with the number</legend>
              {options.map((o, i) => (
                <div className="pb-opt" key={i}>
                  <b className="mono" aria-hidden="true">
                    {i + 1}
                  </b>
                  <input
                    value={o.labelSw}
                    placeholder="Kiswahili"
                    maxLength={60}
                    aria-label={`Option ${i + 1}, Kiswahili`}
                    onChange={(e) =>
                      setOptions(
                        options.map((x, j) => (j === i ? { ...x, labelSw: e.target.value } : x)),
                      )
                    }
                  />
                  <input
                    value={o.label}
                    placeholder="English"
                    maxLength={60}
                    aria-label={`Option ${i + 1}, English`}
                    onChange={(e) =>
                      setOptions(
                        options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    aria-label={`Remove option ${i + 1}`}
                    disabled={options.length <= 2}
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              {options.length < 9 && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm pb-add"
                  onClick={() => setOptions([...options, { label: "", labelSw: "" }])}
                >
                  Add option
                </button>
              )}
            </fieldset>
          )}

          <fieldset className="pb-field">
            <legend>Channels</legend>
            <div className="pb-chips">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`pb-channel${channels.includes(c.id) ? " is-on" : ""}`}
                  aria-pressed={channels.includes(c.id)}
                  onClick={() => setChannels(toggle(channels, c.id))}
                >
                  <b>{c.label}</b>
                  <small>{c.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="pb-field">
            <legend>Who · {segments.length ? `${segments.length} groups` : "all groups"}</legend>
            <div className="pb-tags">
              {(audience?.segments ?? []).map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  className={`pb-tag${segments.includes(s.slug) ? " is-on" : ""}`}
                  aria-pressed={segments.includes(s.slug)}
                  onClick={() => setSegments(toggle(segments, s.slug))}
                >
                  {s.name} <span className="mono">{nf.format(s.people)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="pb-field">
            <legend>Where · {wardIds.length ? `${wardIds.length} wards` : "every ward"}</legend>
            <input
              className="pb-filter"
              type="search"
              value={wardFilter}
              placeholder="Filter wards or constituencies"
              aria-label="Filter wards"
              onChange={(e) => setWardFilter(e.target.value)}
            />
            <div className="pb-tags pb-tags--scroll">
              {wards.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`pb-tag${wardIds.includes(w.id) ? " is-on" : ""}`}
                  aria-pressed={wardIds.includes(w.id)}
                  title={w.constituency}
                  onClick={() => setWardIds(toggle(wardIds, w.id))}
                >
                  {w.name} <span className="mono">{nf.format(w.people)}</span>
                </button>
              ))}
              {audience && wards.length === 0 && <p className="f-note">No ward matches that.</p>}
            </div>
            {wardIds.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost btn--sm pb-add"
                onClick={() => setWardIds([])}
              >
                Clear wards
              </button>
            )}
          </fieldset>

          <div className="pb-row">
            <label className="pb-field">
              <span>Sample cap · blank for everyone</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={sampleTarget}
                placeholder="Everyone"
                onChange={(e) => setSampleTarget(e.target.value)}
              />
            </label>
            <label className="pb-field">
              <span>Thank-you reward</span>
              <select
                value={rewardMethod}
                onChange={(e) => setRewardMethod(e.target.value as RewardMethod)}
              >
                <option value="none">None</option>
                <option value="airtime">Airtime</option>
                <option value="mpesa">M-Pesa</option>
              </select>
            </label>
            {rewardMethod !== "none" && (
              <label className="pb-field">
                <span>KES per person · max {REWARD_MAX_KES}</span>
                <input
                  type="number"
                  min={rewardMethod === "mpesa" ? 10 : 1}
                  max={REWARD_MAX_KES}
                  inputMode="numeric"
                  value={rewardAmount}
                  onChange={(e) => setRewardAmount(e.target.value)}
                />
              </label>
            )}
          </div>

          {rewardMethod !== "none" && (
            <p className="f-note">
              Paying people who answer is spending: it belongs in Finance with its purpose recorded,
              and it is exactly what a disclosure return asks about. Only the first answer from each
              number is paid.
            </p>
          )}
        </div>

        <div className="pb-foot">
          <p className="f-note" aria-live="polite">
            {problem ??
              (estimate ? (
                <>
                  <b>{nf.format(estimate.people)}</b> people in this audience ·{" "}
                  <b>{nf.format(reach)}</b> agreed to SMS
                  {channels.includes("sms") && (
                    <>
                      {" "}
                      · SMS goes to <b>{nf.format(willText)}</b>
                      {cap > 0 && cap < reach ? " (sampled by ward)" : ""}
                    </>
                  )}
                </>
              ) : (
                "Counting the audience…"
              ))}
          </p>
          <button
            className="btn btn--primary"
            type="button"
            disabled={Boolean(problem) || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
