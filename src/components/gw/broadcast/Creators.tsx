import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { reportTotals, type PulseReport } from "@/lib/pulse";
import { addPulsePayouts, getPulse, sendPulseBrief } from "@/lib/pulse.functions";
import { nf } from "@/lib/format";

const today = () => new Date().toISOString().slice(0, 10);
const inWeeks = (n: number) => new Date(Date.now() + n * 7 * 86_400_000).toISOString().slice(0, 10);

function BriefForm({ onSent }: { onSent: () => void }) {
  const send = useServerFn(sendPulseBrief);
  const [f, setF] = useState({
    campaign_name: "",
    objective: "",
    brief: "",
    tone: "Warm, local, plain Kiswahili and English",
    hashtags: "",
    mandatory_mentions: "",
    dos: "",
    donts: "",
    start_date: today(),
    end_date: inWeeks(4),
    budget_kes: "",
    paid_for_by: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: () => send({ data: { ...f, budget_kes: Number(f.budget_kes) } }),
    onSuccess: (r) => {
      toast.success(
        r.created
          ? "Brief sent. The campaign is in Daraja Pulse as a draft."
          : "Brief updated in Daraja Pulse.",
      );
      onSent();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  return (
    <form className="pm-form" onSubmit={submit} aria-label="Brief creators">
      <label className="pb-field pm-wide">
        <span>Name</span>
        <input
          required
          maxLength={120}
          value={f.campaign_name}
          onChange={set("campaign_name")}
          placeholder="Githunguri 2027: dairy and bursaries"
        />
      </label>
      <label className="pb-field pm-wide">
        <span>What it should achieve</span>
        <input
          required
          maxLength={600}
          value={f.objective}
          onChange={set("objective")}
          placeholder="Young voters in Ngewa and Ikinu know the bursary forms are open"
        />
      </label>
      <label className="pb-field pm-wide">
        <span>The message</span>
        <textarea required rows={4} maxLength={4000} value={f.brief} onChange={set("brief")} />
      </label>
      <label className="pb-field pm-wide">
        <span>Tone</span>
        <input maxLength={200} value={f.tone} onChange={set("tone")} />
      </label>
      <label className="pb-field">
        <span>Hashtags</span>
        <input value={f.hashtags} onChange={set("hashtags")} placeholder="#Githunguri2027" />
      </label>
      <label className="pb-field">
        <span>Must mention (one a line)</span>
        <textarea rows={2} value={f.mandatory_mentions} onChange={set("mandatory_mentions")} />
      </label>
      <label className="pb-field">
        <span>Do (one a line)</span>
        <textarea rows={3} value={f.dos} onChange={set("dos")} />
      </label>
      <label className="pb-field">
        <span>Don't (one a line)</span>
        <textarea rows={3} value={f.donts} onChange={set("donts")} />
      </label>
      <label className="pb-field">
        <span>Starts</span>
        <input type="date" required value={f.start_date} onChange={set("start_date")} />
      </label>
      <label className="pb-field">
        <span>Ends</span>
        <input type="date" required value={f.end_date} onChange={set("end_date")} />
      </label>
      <label className="pb-field">
        <span>Budget · KES</span>
        <input
          required
          inputMode="numeric"
          value={f.budget_kes}
          onChange={(e) => setF((x) => ({ ...x, budget_kes: e.target.value.replace(/\D/g, "") }))}
        />
      </label>
      <label className="pb-field">
        <span>Paid for by</span>
        <input required maxLength={160} value={f.paid_for_by} onChange={set("paid_for_by")} />
      </label>
      <p className="f-note pm-wide">
        Pulse adds two lines no one can remove: every post is labelled a paid partnership with your
        "Paid for by" line, and no one is appealed to or targeted by tribe or community.
      </p>
      <div className="pm-actions pm-wide">
        <button type="submit" className="btn btn--primary" disabled={m.isPending}>
          Send to Daraja Pulse
        </button>
      </div>
    </form>
  );
}

function Report({ report, onAdded }: { report: PulseReport; onAdded: () => void }) {
  const add = useServerFn(addPulsePayouts);
  const t = reportTotals(report);
  const views = new Map<string, number>();
  const posts = new Map<string, number>();
  for (const p of report.posts) {
    views.set(p.creator_id, (views.get(p.creator_id) ?? 0) + (p.views ?? 0));
    if (p.url) posts.set(p.creator_id, (posts.get(p.creator_id) ?? 0) + 1);
  }
  const m = useMutation({
    mutationFn: () => add(),
    onSuccess: (r) => {
      toast.success(
        r.added
          ? `${r.added} ${r.added === 1 ? "payout" : "payouts"} added to Finance.`
          : "Finance already has every paid payout.",
      );
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <div className="g4" style={{ marginTop: 12 }}>
        <div className="conn-item">
          <b>{nf.format(t.creators)}</b>
          <p>creators on the brief · {report.status ?? "draft"}</p>
        </div>
        <div className="conn-item">
          <b>{nf.format(t.posts)}</b>
          <p>posts live</p>
        </div>
        <div className="conn-item">
          <b>{nf.format(t.views)}</b>
          <p>views at their peak</p>
        </div>
        <div className="conn-item">
          <b>KES {nf.format(t.paid)}</b>
          <p>paid of KES {nf.format(t.fees)} agreed</p>
        </div>
      </div>
      {report.creators.length ? (
        <div className="tblwrap" style={{ marginTop: 14 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Creator</th>
                <th>Platform</th>
                <th style={{ textAlign: "right" }}>Followers</th>
                <th style={{ textAlign: "right" }}>Fee · KES</th>
                <th style={{ textAlign: "right" }}>Posts</th>
                <th style={{ textAlign: "right" }}>Views</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.creators.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    {c.handle ? <div className="ref">{c.handle}</div> : null}
                  </td>
                  <td>{c.platform ?? "—"}</td>
                  <td className="num">{c.followers === null ? "—" : nf.format(c.followers)}</td>
                  <td className="num">{c.fee_kes === null ? "—" : nf.format(c.fee_kes)}</td>
                  <td className="num">{nf.format(posts.get(c.id) ?? 0)}</td>
                  <td className="num">{nf.format(views.get(c.id) ?? 0)}</td>
                  <td>{c.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="f-note" style={{ marginTop: 12 }}>
          No creators on the brief yet: Pulse's team picks them.
        </p>
      )}
      <div className="pm-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={m.isPending || t.paid === 0}
          onClick={() => m.mutate()}
        >
          Add paid payouts to Finance
        </button>
      </div>
    </>
  );
}

/** Creators through Daraja Pulse: the brief out, the posts and payouts back. */
export function Creators({ canBrief }: { canBrief: boolean }) {
  const fetchPulse = useServerFn(getPulse);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["pulse"],
    queryFn: () => fetchPulse(),
    enabled: canBrief,
  });
  const [briefing, setBriefing] = useState(false);
  if (!canBrief) return null;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["pulse"] });
    await queryClient.invalidateQueries({ queryKey: ["finance"] });
  };
  return (
    <div className="card fx3" style={{ marginTop: 14 }}>
      <div className="card-head">
        <h2>Creators · Daraja Pulse</h2>
        {data?.connected ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setBriefing((b) => !b)}
          >
            {briefing ? "Close" : data.report ? "Update the brief" : "Brief creators"}
          </button>
        ) : (
          <span className="mono">disclosed, paid partnerships</span>
        )}
      </div>
      {!data ? (
        <p className="meta">Checking Daraja Pulse…</p>
      ) : !data.connected ? (
        <p className="f-note">
          {data.why} It needs PULSE_FUNCTIONS_URL and PULSE_JOB_KEY set in the project's secrets.
        </p>
      ) : (
        <>
          {data.why ? <p className="f-note">{data.why}</p> : null}
          {briefing ? (
            <BriefForm
              onSent={async () => {
                setBriefing(false);
                await refresh();
              }}
            />
          ) : null}
          {data.report ? (
            <Report report={data.report} onAdded={refresh} />
          ) : !briefing ? (
            <p className="f-note">No brief yet. Send one and Pulse's team picks the creators.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
