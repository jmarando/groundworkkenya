import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { addDays, mondayOf, nairobiToday } from "@/lib/field-plan";
import {
  approveStipendLines,
  makeStipends,
  mpesaReady,
  payStipendByMpesa,
  recordStipendReceipt,
  releaseStipendPayout,
} from "@/lib/stipends.functions";

const useRefresh = () => {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ["agents"] });
    await queryClient.invalidateQueries({ queryKey: ["finance"] });
  };
};

/** Make stipends from the days knocked, and approve every pending line in view. */
export function StipendTools({ pendingIds }: { pendingIds: string[] }) {
  const make = useServerFn(makeStipends);
  const approve = useServerFn(approveStipendLines);
  const refresh = useRefresh();
  const today = nairobiToday();
  const [from, setFrom] = useState(addDays(mondayOf(today), -7));
  const [to, setTo] = useState(today);
  const [rate, setRate] = useState("1000");
  const made = useMutation({
    mutationFn: () => make({ data: { from, to, rate: Number(rate) } }),
    onSuccess: async (r) => {
      toast.success(
        r.added
          ? `${r.added} ${r.added === 1 ? "day" : "days"} added as pending stipends.`
          : "No new days worked in that window: every day is already on the run.",
      );
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const approved = useMutation({
    mutationFn: () => approve({ data: { ids: pendingIds } }),
    onSuccess: async (r) => {
      toast.success(`${r.approved} approved. Your name and the time are on each.`);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="pm-form st-tools"
      onSubmit={(e) => {
        e.preventDefault();
        made.mutate();
      }}
      aria-label="Make stipends from the field plan"
    >
      <label className="pb-field">
        <span>Days worked from</span>
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="pb-field">
        <span>To</span>
        <input
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      <label className="pb-field">
        <span>A day's rate · KES</span>
        <input
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <div className="pm-actions">
        <button type="submit" className="btn btn--primary" disabled={made.isPending}>
          Make stipends
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={approved.isPending || pendingIds.length === 0}
          onClick={() => approved.mutate()}
        >
          Approve {pendingIds.length} pending
        </button>
      </div>
      <p className="f-note pm-wide">
        One stipend per person for each day they knocked doors on a walk list. Approve them, then
        pay: by M-Pesa from here once it's connected, or record the receipt of a payment made from a
        phone. Each payment posts to Finance once.
      </p>
    </form>
  );
}

/** What can be done with one stipend line now. */
export function StipendAction({
  id,
  status,
  paymentError,
}: {
  id: string;
  status: string;
  paymentError: string | null;
}) {
  const approve = useServerFn(approveStipendLines);
  const record = useServerFn(recordStipendReceipt);
  const pay = useServerFn(payStipendByMpesa);
  const release = useServerFn(releaseStipendPayout);
  const ready = useServerFn(mpesaReady);
  const refresh = useRefresh();
  const { data: mpesa } = useQuery({
    queryKey: ["mpesa-ready"],
    queryFn: () => ready(),
    staleTime: 300_000,
  });
  const [receipt, setReceipt] = useState("");
  const [entering, setEntering] = useState(false);
  const done = async (msg: string) => {
    toast.success(msg);
    setEntering(false);
    await refresh();
  };
  const fail = (e: Error) => toast.error(e.message);
  const approving = useMutation({
    mutationFn: () => approve({ data: { ids: [id] } }),
    onSuccess: () => done("Approved."),
    onError: fail,
  });
  const recording = useMutation({
    mutationFn: () => record({ data: { id, receipt } }),
    onSuccess: () => done("Paid, and posted to Finance."),
    onError: fail,
  });
  const paying = useMutation({
    mutationFn: () => pay({ data: { id } }),
    onSuccess: (r) =>
      done(r.status === "sent" ? "Sent to M-Pesa. The receipt arrives when it's paid." : r.why),
    onError: fail,
  });
  const releasing = useMutation({
    mutationFn: () => release({ data: { id } }),
    onSuccess: () => done("Released: it can be paid again."),
    onError: fail,
  });

  if (status === "pending" || status === "held")
    return (
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={approving.isPending}
        onClick={() => approving.mutate()}
      >
        {status === "held" ? "Approve anyway" : "Approve"}
      </button>
    );
  if (status === "paid") return null;
  if (entering)
    return (
      <form
        className="st-receipt"
        onSubmit={(e) => {
          e.preventDefault();
          recording.mutate();
        }}
      >
        <label className="sr" htmlFor={`rc-${id}`}>
          M-Pesa receipt
        </label>
        <input
          id={`rc-${id}`}
          value={receipt}
          placeholder="e.g. SJK3L2M9QX"
          maxLength={14}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setReceipt(e.target.value.toUpperCase())}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={recording.isPending}>
          Save
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEntering(false)}>
          Cancel
        </button>
      </form>
    );
  const inFlight = status === "sending";
  return (
    <div className="st-actions">
      {paymentError ? <span className="st-error">{paymentError}</span> : null}
      {status === "approved" && mpesa?.ready ? (
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={paying.isPending}
          onClick={() => paying.mutate()}
        >
          Pay by M-Pesa
        </button>
      ) : null}
      {inFlight && !paymentError ? <span className="pill pill--amber">With M-Pesa</span> : null}
      {!inFlight || paymentError ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEntering(true)}>
          Record receipt
        </button>
      ) : null}
      {inFlight && paymentError ? (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={releasing.isPending}
          onClick={() => releasing.mutate()}
        >
          Not on the statement: release
        </button>
      ) : null}
    </div>
  );
}
