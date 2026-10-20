// Finance's two forms: a contribution received and an expense to approve. Both go through the
// server, which checks the role and the fields; an expense is always recorded pending.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  DONOR_TYPES,
  EXPENSE_CATEGORIES,
  PAY_METHODS,
  recordContribution,
  recordExpense,
} from "@/lib/finance.functions";

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const METHOD: Record<string, string> = {
  mpesa: "M-Pesa",
  bank: "Bank",
  cash: "Cash",
  cheque: "Cheque",
};

export function RecordMoney() {
  const [open, setOpen] = useState<"in" | "out" | null>(null);
  return (
    <div className="card" style={{ marginTop: 14 }} id="record">
      <div className="card-head">
        <div>
          <h2>Record money</h2>
          <p className="meta">
            A contribution as it arrives, or an expense with its receipt number for approval.
          </p>
        </div>
        <div className="fchips">
          <button
            type="button"
            className="fchip"
            aria-pressed={open === "in"}
            onClick={() => setOpen(open === "in" ? null : "in")}
          >
            Contribution received
          </button>
          <button
            type="button"
            className="fchip"
            aria-pressed={open === "out"}
            onClick={() => setOpen(open === "out" ? null : "out")}
          >
            Expense
          </button>
        </div>
      </div>
      {open === "in" && <ContributionForm done={() => setOpen(null)} />}
      {open === "out" && <ExpenseForm done={() => setOpen(null)} />}
    </div>
  );
}

function ContributionForm({ done }: { done: () => void }) {
  const save = useServerFn(recordContribution);
  const qc = useQueryClient();
  const [f, setF] = useState({
    donorName: "",
    donorType: "individual",
    amountKes: "",
    method: "mpesa",
    reference: "",
    receivedOn: today(),
  });
  const m = useMutation({
    mutationFn: () => save({ data: f }),
    onSuccess: async () => {
      toast.success("Contribution recorded.");
      await qc.invalidateQueries({ queryKey: ["finance"] });
      done();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="pm-form"
      aria-label="Record a contribution"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="pb-field">
        <span>Donor</span>
        <input value={f.donorName} onChange={set("donorName")} maxLength={200} required />
      </label>
      <label className="pb-field">
        <span>Kind of donor</span>
        <select value={f.donorType} onChange={set("donorType")}>
          {DONOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="pb-field">
        <span>Amount, KES</span>
        <input inputMode="decimal" value={f.amountKes} onChange={set("amountKes")} required />
      </label>
      <label className="pb-field">
        <span>Paid by</span>
        <select value={f.method} onChange={set("method")}>
          {PAY_METHODS.map((t) => (
            <option key={t} value={t}>
              {METHOD[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="pb-field">
        <span>Reference {f.method === "cash" ? "(optional)" : ""}</span>
        <input
          value={f.reference}
          onChange={set("reference")}
          maxLength={80}
          placeholder="M-Pesa code or bank reference"
        />
      </label>
      <label className="pb-field">
        <span>Received on</span>
        <input
          type="date"
          value={f.receivedOn}
          max={today()}
          onChange={set("receivedOn")}
          required
        />
      </label>
      <div className="pm-actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={m.isPending}>
          {m.isPending ? "Saving…" : "Record contribution"}
        </button>
      </div>
    </form>
  );
}

function ExpenseForm({ done }: { done: () => void }) {
  const save = useServerFn(recordExpense);
  const qc = useQueryClient();
  const [f, setF] = useState({
    description: "",
    category: "operations",
    vendor: "",
    amountKes: "",
    reference: "",
    incurredOn: today(),
  });
  const m = useMutation({
    mutationFn: () => save({ data: f }),
    onSuccess: async () => {
      toast.success("Expense recorded. It waits for approval with its receipt.");
      await qc.invalidateQueries({ queryKey: ["finance"] });
      done();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="pm-form"
      aria-label="Record an expense"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="pb-field">
        <span>What for</span>
        <input value={f.description} onChange={set("description")} maxLength={300} required />
      </label>
      <label className="pb-field">
        <span>Category</span>
        <select value={f.category} onChange={set("category")}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="pb-field">
        <span>Paid to</span>
        <input value={f.vendor} onChange={set("vendor")} maxLength={120} />
      </label>
      <label className="pb-field">
        <span>Amount, KES</span>
        <input inputMode="decimal" value={f.amountKes} onChange={set("amountKes")} required />
      </label>
      <label className="pb-field">
        <span>Receipt or invoice number</span>
        <input value={f.reference} onChange={set("reference")} maxLength={80} />
      </label>
      <label className="pb-field">
        <span>Date</span>
        <input
          type="date"
          value={f.incurredOn}
          max={today()}
          onChange={set("incurredOn")}
          required
        />
      </label>
      <p className="f-note">
        It is recorded pending. The candidate or manager approves it once the receipt number is on
        it.
      </p>
      <div className="pm-actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={m.isPending}>
          {m.isPending ? "Saving…" : "Record expense"}
        </button>
      </div>
    </form>
  );
}
