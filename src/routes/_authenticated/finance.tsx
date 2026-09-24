import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { getFinance } from "@/lib/console.functions";
import { approveExpense } from "@/lib/finance.functions";
import { useAccess } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated/finance")({
  component: Finance,
  head: () => ({
    meta: [
      { title: "Finance · Groundwork" },
      {
        name: "description",
        content: "Contributions, spend against the statutory limit and an append-only ledger.",
      },
      { property: "og:title", content: "Finance · Groundwork" },
      {
        property: "og:description",
        content: "Contributions, spend against the statutory limit and an append-only ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const nf = new Intl.NumberFormat("en-KE");
const money = (n: number) => nf.format(Math.round(n));
const millions = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

function Finance() {
  const { isPrincipal, loading } = useAccess();
  const fetchFinance = useServerFn(getFinance);
  const approve = useServerFn(approveExpense);
  const queryClient = useQueryClient();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const approval = useMutation({
    mutationFn: (id: string) => approve({ data: { id } }),
    onSuccess: async () => {
      toast.success("Approved. Your name and the time are on the record.");
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setApprovingId(null),
  });
  const { data } = useQuery({
    queryKey: ["finance"],
    queryFn: () => fetchFinance(),
    enabled: isPrincipal,
  });

  if (!loading && !isPrincipal) {
    return (
      <section className="view active" aria-label="Finance">
        <div className="vh">
          <div>
            <span className="eyebrow">Campaign finance · restricted</span>
            <h1>
              Money stays <span className="serif">closed.</span>
            </h1>
            <p className="meta">
              Contributions, spend and the ledger are visible to the candidate and the campaign
              manager only. Ask them to open it for you if you need access.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="view active" aria-label="Finance">
        <div className="vh">
          <div>
            <span className="eyebrow">Campaign finance · regulated period</span>
            <h1>
              Every shilling, <span className="serif">accounted.</span>
            </h1>
            <p className="meta">Loading the ledger…</p>
          </div>
        </div>
      </section>
    );
  }

  const pct = (data.spendKes / data.statutoryLimit) * 100;
  const maxCat = Math.max(...data.byCategory.map((c) => c.amount), 1);

  return (
    <section className="view active" aria-label="Finance">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Campaign finance · regulated period</span>
          <h1>
            Every shilling, <span className="serif">accounted.</span>
          </h1>
          <p className="meta">
            {data.ledger.length} recent entries · {data.contributors} contributors on record
          </p>
        </div>
        <div className="vh-side">
          <span className="syncline">
            <span className="dot-live" aria-hidden="true" /> Reconciled against live data
          </span>
        </div>
      </div>

      <div className="card limit-strip fx2">
        <div className="card-head" style={{ marginBottom: 6 }}>
          <span className="eyebrow">Spend against the statutory limit</span>
          <span className="mono">alerts at 50 · 75 · 90 · 100%</span>
        </div>
        <div className="limit-top">
          <span className="limit-big stat">KES {money(data.spendKes)}</span>
          <span className="limit-of">
            of KES {money(data.statutoryLimit)} · {pct.toFixed(1)}%
          </span>
        </div>
        <div
          className="limit-track"
          role="img"
          aria-label={`${pct.toFixed(1)} percent of the statutory spending limit used`}
        >
          <span className="limit-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
          <span className="limit-tick" style={{ left: "50%" }} />
          <span className="limit-tick" style={{ left: "75%" }} />
          <span className="limit-tick" style={{ left: "90%" }} />
        </div>
        <div className="limit-labels">
          <span style={{ left: "50%" }}>50</span>
          <span style={{ left: "75%" }}>75</span>
          <span style={{ left: "90%" }}>90</span>
        </div>
      </div>

      <div className="g3 fx3">
        <div className="card">
          <div className="card-head">
            <h2>Contributions</h2>
            <span className="mono">ledger</span>
          </div>
          <span className="f-big stat">KES {millions(data.contributionsKes)}</span>
          <div className="f-rows">
            <div className="f-row">
              <span>Contributors on record</span>
              <b className="stat">{data.contributors}</b>
            </div>
            <div className="f-row">
              <span>In-kind, valued &amp; recorded</span>
              <b className="stat">KES {money(data.inKindKes)}</b>
            </div>
            <div className="f-row">
              <span>Disclosed publicly</span>
              <b className="stat">
                {data.contributions.filter((c) => c.disclosed).length}/{data.contributions.length}
              </b>
            </div>
          </div>
          <p className="f-note">Reconciles nightly against the designated campaign account.</p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Documentation</h2>
            <span className="mono">receipts · references</span>
          </div>
          <span className="f-big stat">{data.documented.toFixed(1)}%</span>
          <div className="f-rows">
            <div className="f-row">
              <span>Documented spend</span>
              <b className="stat">KES {millions(data.spendKes)}</b>
            </div>
            <div className="f-row">
              <span>Awaiting approval</span>
              <span className="pill pill--amber">
                <span className="g" aria-hidden="true">
                  ◐
                </span>{" "}
                {data.pending.length} pending
              </span>
            </div>
          </div>
          <p className="f-note">A transaction without its document stays flagged until resolved.</p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Spend by category</h2>
            <span className="mono">KES · window to date</span>
          </div>
          <div className="barlist">
            {data.byCategory.map((c) => (
              <div className="barlist-row" key={c.name}>
                <span className="lbl">{c.name}</span>
                <span className="barlist-track">
                  <i style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                </span>
                <span className="val">{millions(c.amount)}</span>
              </div>
            ))}
          </div>
          <p className="f-note">Every broadcast send posts here as comms, with its receipt.</p>
        </div>
      </div>

      <div className="card fx4" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <h2>Awaiting the authorised person</h2>
            <p className="meta">Every expenditure routes through approval before disbursement</p>
          </div>
          <span className="mono">{data.pending.length} pending</span>
        </div>
        {data.pending.length === 0 && (
          <p className="f-note">Nothing waiting. The queue is clear.</p>
        )}
        {data.pending.map((q) => (
          <div className="q-row" key={q.id}>
            <span className="q-desc">
              {q.description}
              <small>
                {q.vendor ?? "No vendor"} ·{" "}
                <span className="mono">{q.reference ?? "no document reference"}</span>
              </small>
            </span>
            <span className="q-amt">KES {money(q.amount)}</span>
            <span className="q-actions">
              {q.reference ? (
                <span className="pill pill--ok">
                  <span className="g" aria-hidden="true">
                    ●
                  </span>{" "}
                  Documented
                </span>
              ) : (
                <span className="pill pill--outline-red">
                  <span className="g" aria-hidden="true">
                    ▲
                  </span>{" "}
                  No document
                </span>
              )}
              <button
                className="btn btn--primary btn--sm"
                type="button"
                disabled={!q.reference || approvingId === q.id}
                onClick={() => {
                  if (!window.confirm(`Approve KES ${money(q.amount)} for ${q.description}?`))
                    return;
                  setApprovingId(q.id);
                  approval.mutate(q.id);
                }}
              >
                {approvingId === q.id ? "Approving…" : "Approve"}
              </button>
            </span>
            {!q.reference && (
              <span className="q-blocknote">
                Approval stays disabled until documentation is attached. The block is the feature.
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="card fx5" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>Ledger · recent</h2>
          <span className="mono">append-only · edits reverse, never delete</span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Reference</th>
                <th style={{ textAlign: "right" }}>Amount · KES</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.map((l) => (
                <tr key={l.id}>
                  <td className="ref">{day(l.date)}</td>
                  <td>
                    <span className="catchip">{l.category}</span>
                  </td>
                  <td>
                    {l.description}
                    {l.vendor ? ` · ${l.vendor}` : ""}
                  </td>
                  <td className="ref">{l.reference ?? "—"}</td>
                  <td className="num">{money(l.amount)}</td>
                  <td className="meta">{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card fx5" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>Contributions received</h2>
          <span className="mono">{data.contributions.length} on record</span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Contributor</th>
                <th>Type</th>
                <th>Method</th>
                <th>Reference</th>
                <th style={{ textAlign: "right" }}>Amount · KES</th>
                <th>Disclosure</th>
              </tr>
            </thead>
            <tbody>
              {data.contributions.map((c) => (
                <tr key={c.id}>
                  <td className="ref">{day(c.date)}</td>
                  <td>{c.donor}</td>
                  <td className="meta">{c.type}</td>
                  <td className="meta">{c.method}</td>
                  <td className="ref">{c.reference ?? "—"}</td>
                  <td className="num">{money(c.amount)}</td>
                  <td>
                    {c.disclosed ? (
                      <span className="pill pill--ok">
                        <span className="g" aria-hidden="true">
                          ●
                        </span>{" "}
                        Disclosed
                      </span>
                    ) : (
                      <span className="pill pill--amber">
                        <span className="g" aria-hidden="true">
                          ◐
                        </span>{" "}
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
