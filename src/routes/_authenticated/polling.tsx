import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PollBuilder } from "@/components/gw/PollBuilder";
import { useAccess } from "@/hooks/useAccess";
import { getPolling } from "@/lib/console.functions";
import { downloadCSV, stampName } from "@/lib/csv";
import { closePoll, getPollDetail, launchPoll } from "@/lib/polls.functions";

export const Route = createFileRoute("/_authenticated/polling")({
  // ?ask= opens the builder with a question filled in (from the morning briefing).
  validateSearch: (search: Record<string, unknown>): { ask?: string } =>
    typeof search["ask"] === "string" && search["ask"].trim()
      ? { ask: search["ask"].slice(0, 300) }
      : {},
  component: Polling,
  head: () => ({
    meta: [
      { title: "Polling · Groundwork" },
      {
        name: "description",
        content: "Run short polls by SMS and USSD and read the results ward by ward.",
      },
      { property: "og:title", content: "Polling · Groundwork" },
      {
        property: "og:description",
        content: "Run short polls by SMS and USSD and read the results ward by ward.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";

/** Weighted results for one poll, fetched when the card is expanded. */
function PollResults({ id }: { id: string }) {
  const fetchDetail = useServerFn(getPollDetail);
  const { data, isError } = useQuery({
    queryKey: ["poll-detail", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  if (isError) return <p className="f-note">Could not load these results.</p>;
  if (!data) return <p className="f-note">Weighting the answers…</p>;

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  return (
    <div className="pr">
      <div className="pr-grid" role="table" aria-label="Weighted results">
        <div className="pr-head" role="row">
          <span role="columnheader">Answer</span>
          <span role="columnheader">Raw</span>
          <span role="columnheader">{data.weighting ? "Weighted" : "Share"}</span>
        </div>
        {data.options.map((o) => (
          <div className="pr-row" role="row" key={o.key}>
            <span role="cell">{o.label}</span>
            <span role="cell" className="mono">
              {pct(o.share)}
            </span>
            <span role="cell" className="mono pr-w">
              {pct(data.weighting ? o.weighted : o.share)}
            </span>
          </div>
        ))}
      </div>
      <p className="f-note">
        {nf.format(data.responses)} answers
        {data.responseRate !== null ? ` · ${pct(data.responseRate)} of those invited` : ""}
        {data.marginOfError !== null
          ? ` · ±${data.marginOfError} points`
          : " · too few answers for a margin of error"}
        {data.weighting ? " · weighted to each ward's share of the audience" : ""}
        {data.byChannel.length
          ? ` · ${data.byChannel.map((c) => `${c.channel.toUpperCase()} ${nf.format(c.count)}`).join(", ")}`
          : ""}
      </p>
      {data.byChannel.some((c) => c.channel === "web") && (
        <p className="f-note">
          Web answers are not verified: anyone can type any number into the form. Read them
          alongside the SMS and USSD answers, where the network vouches for the number.
        </p>
      )}
      {data.openAnswers.length > 0 && (
        <ul className="pr-open">
          {data.openAnswers.slice(0, 12).map((t, i) => (
            <li key={i}>“{t}”</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Polling() {
  const fetchPolling = useServerFn(getPolling);
  const launch = useServerFn(launchPoll);
  const close = useServerFn(closePoll);
  const queryClient = useQueryClient();
  const { isPrincipal } = useAccess();
  const [building, setBuilding] = useState(false);
  const { ask } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  useEffect(() => {
    if (ask && isPrincipal) setBuilding(true);
  }, [ask, isPrincipal]);
  const closeBuilder = () => {
    setBuilding(false);
    if (ask) void navigate({ search: {}, replace: true });
  };
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["polling"], queryFn: () => fetchPolling() });

  const refresh = async (id?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["polling"] });
    if (id) await queryClient.invalidateQueries({ queryKey: ["poll-detail", id] });
  };

  const launching = useMutation({
    mutationFn: (id: string) => launch({ data: { id } }),
    onSuccess: async (r, id) => {
      const held = r.audience - r.reachable;
      toast.success(
        r.live
          ? `${r.code} is live. Sending to ${nf.format(r.queued)} people.`
          : `${r.code} is live in dry run: ${nf.format(r.queued)} SMS composed, none sent.`,
        {
          description:
            (held > 0 ? `${nf.format(held)} in the audience have not agreed to SMS. ` : "") +
            (r.webLink ? `Web link: ${r.webLink}` : ""),
        },
      );
      await refresh(id);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyId(null),
  });

  const closing = useMutation({
    mutationFn: (id: string) => close({ data: { id } }),
    onSuccess: async (_r, id) => {
      toast.success("Poll closed. Late replies will go to the inbox.");
      await refresh(id);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyId(null),
  });

  if (!data) {
    return (
      <section className="view active" aria-label="Polling">
        <div className="vh">
          <div>
            <span className="eyebrow">Listening · polling</span>
            <h1>
              Ask, <span className="serif">then count.</span>
            </h1>
            <p className="meta">Loading polls…</p>
          </div>
        </div>
      </section>
    );
  }

  const totalResponses = data.polls.reduce((s, p) => s + p.responses, 0);

  return (
    <section className="view active" aria-label="Polling">
      {building && <PollBuilder onClose={closeBuilder} initialQuestion={ask} />}
      <div className="vh fx">
        <div>
          <span className="eyebrow">Listening · polling</span>
          <h1>
            Ask, <span className="serif">then count.</span>
          </h1>
          <p className="meta">
            Short polls on SMS and USSD, answered on any handset. Results land here as they come in.
          </p>
        </div>
        <div className="vh-side">
          {isPrincipal && (
            <button className="btn btn--primary" type="button" onClick={() => setBuilding(true)}>
              New poll
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              downloadCSV(
                stampName("groundwork-poll-results"),
                [
                  "Poll code",
                  "Question",
                  "Status",
                  "Channels",
                  "Answer",
                  "Responses",
                  "Share %",
                  "Total responses",
                  "Sample target",
                  "Opens",
                  "Closes",
                ],
                data.polls.flatMap((p) =>
                  p.options.map((o) => [
                    p.code,
                    p.question,
                    p.status,
                    p.channels.join(" "),
                    o.label,
                    o.count,
                    p.responses ? Math.round((o.count / p.responses) * 1000) / 10 : 0,
                    p.responses,
                    p.sampleTarget,
                    p.opensAt ? p.opensAt.slice(0, 10) : "",
                    p.closesAt ? p.closesAt.slice(0, 10) : "",
                  ]),
                ),
              )
            }
          >
            Download results · CSV
          </button>
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> {nf.format(totalResponses)} responses
            counted
          </span>
        </div>
      </div>

      <div className="g2 fx2">
        {data.polls.map((p) => {
          const max = Math.max(...p.options.map((o) => o.count), 1);
          const pct = p.sampleTarget ? Math.min((p.responses / p.sampleTarget) * 100, 100) : 0;
          return (
            <div className="card" key={p.id}>
              <div className="card-head">
                <div>
                  <h2>{p.question}</h2>
                  <p className="meta">
                    <span className="mono">{p.code}</span> · {p.channels.join(" · ")} ·{" "}
                    {day(p.opensAt)} to {day(p.closesAt)}
                  </p>
                </div>
                <span className={`pill ${p.status === "live" ? "pill--ok" : "pill--amber"}`}>
                  <span className="g" aria-hidden="true">
                    ●
                  </span>{" "}
                  {p.status}
                </span>
              </div>

              <div className="barlist">
                {p.options.map((o) => (
                  <div className="barlist-row" key={o.key}>
                    <span className="lbl">{o.label}</span>
                    <span className="barlist-track">
                      <i style={{ width: `${(o.count / max) * 100}%` }} />
                    </span>
                    <span className="val">
                      {nf.format(o.count)}
                      {p.responses ? ` · ${((o.count / p.responses) * 100).toFixed(0)}%` : ""}
                    </span>
                  </div>
                ))}
                {p.options.length === 0 && <p className="f-note">Free-text poll — no options.</p>}
              </div>

              <div className="f-rows" style={{ marginTop: 12 }}>
                <div className="f-row">
                  <span>Responses</span>
                  <b className="stat">{nf.format(p.responses)}</b>
                </div>
                <div className="f-row">
                  <span>Sample target</span>
                  <b className="stat">{nf.format(p.sampleTarget)}</b>
                </div>
                <div className="f-row">
                  <span>Channel mix</span>
                  <b>
                    {p.channelMix.map((c) => `${c.channel.toUpperCase()} ${c.count}`).join(" · ") ||
                      "—"}
                  </b>
                </div>
                {p.reward && (
                  <div className="f-row">
                    <span>Reward</span>
                    <b>{p.reward}</b>
                  </div>
                )}
              </div>
              {p.sampleTarget > 0 && (
                <>
                  <div className="minibar" style={{ marginTop: 10 }}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <p className="f-note">{pct.toFixed(0)}% of the sample target reached.</p>
                </>
              )}

              {openId === p.id && <PollResults id={p.id} />}

              <div className="pb-actions">
                {isPrincipal && p.status === "draft" && (
                  <button
                    className="btn btn--primary btn--sm"
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Launch ${p.code}? Everyone in its audience who agreed to SMS will be sent the question.`,
                        )
                      )
                        return;
                      setBusyId(p.id);
                      launching.mutate(p.id);
                    }}
                  >
                    {busyId === p.id ? "Launching…" : "Launch"}
                  </button>
                )}
                {isPrincipal && p.status === "live" && (
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => {
                      setBusyId(p.id);
                      closing.mutate(p.id);
                    }}
                  >
                    {busyId === p.id ? "Closing…" : "Close poll"}
                  </button>
                )}
                {p.responses > 0 && (
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    aria-expanded={openId === p.id}
                    onClick={() => setOpenId(openId === p.id ? null : p.id)}
                  >
                    {openId === p.id ? "Hide weighted results" : "Weighted results"}
                  </button>
                )}
                {p.channels.includes("web") && p.status === "live" && (
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    onClick={() => {
                      const link = `${window.location.origin}/p/${p.code}`;
                      void navigator.clipboard?.writeText(link);
                      toast.success("Poll link copied.", { description: link });
                    }}
                  >
                    Copy link
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {data.polls.length === 0 && (
          <div className="card">
            <p className="f-note">No polls yet.{isPrincipal ? " Start one with New poll." : ""}</p>
          </div>
        )}
      </div>

      {data.heat && (
        <div className="card fx3" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2>Where the answers differ</h2>
            <span className="mono">share of responses by constituency</span>
          </div>
          <div className="tblwrap">
            <table className="tbl heat">
              <thead>
                <tr>
                  <th>Option</th>
                  {data.heat.constituencies.map((c) => (
                    <th key={c} style={{ textAlign: "right" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.heat.rows.map((r) => (
                  <tr key={r.option}>
                    <td>
                      <b>{r.option}</b>
                    </td>
                    {r.shares.map((s, i) => (
                      <td
                        className="num"
                        key={i}
                        style={{
                          background: `color-mix(in srgb, var(--murram) ${Math.round(s)}%, transparent)`,
                        }}
                      >
                        {s.toFixed(0)}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="f-note">
            Every response is tied to a ward, so you can see which side of the constituency answered
            differently.
          </p>
        </div>
      )}
    </section>
  );
}
