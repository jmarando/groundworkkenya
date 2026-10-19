import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { bookMediaBuy, getMediaBuys, recordMediaResults } from "@/lib/media.functions";
import { byPlatform, costPerThousand, platformInfo, PLATFORMS, type BuyRow } from "@/lib/media";

const nf = new Intl.NumberFormat("en-KE");
const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const today = () => new Date().toISOString().slice(0, 10);

function Results({ buy, onSaved }: { buy: BuyRow; onSaved: () => void }) {
  const save = useServerFn(recordMediaResults);
  const [open, setOpen] = useState(false);
  const [reach, setReach] = useState(buy.reach?.toString() ?? "");
  const [impressions, setImpressions] = useState(buy.impressions?.toString() ?? "");
  const [clicks, setClicks] = useState(buy.clicks?.toString() ?? "");
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: buy.id,
          reach: reach === "" ? null : Number(reach),
          impressions: impressions === "" ? null : Number(impressions),
          clicks: clicks === "" ? null : Number(clicks),
        },
      }),
    onSuccess: () => {
      toast.success("Results saved.");
      setOpen(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!open)
    return (
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
        {buy.resultsOn ? "Update results" : "Add results"}
      </button>
    );
  return (
    <form
      className="pm-results"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="pb-field">
        <span>Reach</span>
        <input
          inputMode="numeric"
          value={reach}
          onChange={(e) => setReach(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="pb-field">
        <span>Impressions</span>
        <input
          inputMode="numeric"
          value={impressions}
          onChange={(e) => setImpressions(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="pb-field">
        <span>Clicks</span>
        <input
          inputMode="numeric"
          value={clicks}
          onChange={(e) => setClicks(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <div className="pm-actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={m.isPending}>
          Save
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function BookForm({
  wards,
  onBooked,
}: {
  wards: { id: string; name: string }[];
  onBooked: () => void;
}) {
  const book = useServerFn(bookMediaBuy);
  const [platform, setPlatform] = useState("meta");
  const [name, setName] = useState("");
  const [wardId, setWardId] = useState("");
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(today());
  const [amount, setAmount] = useState("");
  const [paidForBy, setPaidForBy] = useState("");
  const [externalId, setExternalId] = useState("");
  const m = useMutation({
    mutationFn: () =>
      book({
        data: {
          platform,
          name,
          wardId: wardId || null,
          startsOn,
          endsOn,
          amountKes: Number(amount),
          paidForBy,
          externalId: externalId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Booked. It's in Finance, waiting for approval.");
      setName("");
      setAmount("");
      setExternalId("");
      onBooked();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  const rule = platformInfo(platform).rule;
  return (
    <form className="pm-form" onSubmit={submit} aria-label="Book an ad">
      <label className="pb-field">
        <span>Where it runs</span>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORMS.filter((p) => p.bookable).map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="pb-field">
        <span>Name</span>
        <input
          required
          maxLength={120}
          value={name}
          placeholder="Bursary reminder, Komothai"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="pb-field">
        <span>Ward it aims at</span>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
          <option value="">The whole seat</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="pb-field">
        <span>Starts</span>
        <input
          type="date"
          required
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
        />
      </label>
      <label className="pb-field">
        <span>Ends</span>
        <input type="date" required value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
      </label>
      <label className="pb-field">
        <span>Amount · KES</span>
        <input
          required
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="pb-field pm-wide">
        <span>Paid for by</span>
        <input
          required
          maxLength={160}
          value={paidForBy}
          placeholder="Paid for by the Friends of the candidate"
          onChange={(e) => setPaidForBy(e.target.value)}
        />
      </label>
      <label className="pb-field">
        <span>Platform id (optional)</span>
        <input
          maxLength={120}
          value={externalId}
          placeholder="Campaign or order id"
          onChange={(e) => setExternalId(e.target.value)}
        />
      </label>
      <p className="f-note pm-wide">{rule}</p>
      <div className="pm-actions pm-wide">
        <button type="submit" className="btn btn--primary" disabled={m.isPending}>
          Book and send to Finance
        </button>
      </div>
    </form>
  );
}

/**
 * Paid media, step 1: what the campaign has bought, platform by platform, each booking posted to
 * Finance against the spending limit, with what it delivered once the platform reports it.
 */
export function PaidMedia({
  wards,
  canBook,
}: {
  wards: { id: string; name: string }[];
  canBook: boolean;
}) {
  const fetchBuys = useServerFn(getMediaBuys);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["media-buys"],
    queryFn: () => fetchBuys(),
    enabled: canBook,
  });
  const [booking, setBooking] = useState(false);
  const buys = data?.buys ?? [];
  const totals = new Map(byPlatform(buys).map((t) => [t.platform, t]));
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["media-buys"] });
    await queryClient.invalidateQueries({ queryKey: ["finance"] });
  };

  return (
    <div className="card fx3" style={{ marginTop: 14 }}>
      <div className="card-head">
        <h2>Paid media · same audience, bought</h2>
        {canBook && data?.available ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setBooking((b) => !b)}
          >
            {booking ? "Close" : "Book an ad"}
          </button>
        ) : (
          <span className="mono">ward-level geo · disclosed sponsor</span>
        )}
      </div>
      <div className="g4">
        {PLATFORMS.filter((p) => ["meta", "google", "youtube", "tiktok"].includes(p.key)).map(
          (p) => {
            const t = totals.get(p.key);
            return (
              <div className="conn-item" key={p.key}>
                <span className={`ch ${p.cls}`}>{p.code}</span>
                <b>{p.name}</b>
                <p>{p.rule}</p>
                {!p.bookable ? (
                  <span className="pill pill--red">No paid political ads</span>
                ) : t ? (
                  <span className="pill pill--ok">
                    KES {nf.format(t.amountKes)} · {t.buys} {t.buys === 1 ? "buy" : "buys"}
                  </span>
                ) : (
                  <span className="pill pill--amber">Verify before launch</span>
                )}
              </div>
            );
          },
        )}
      </div>
      {canBook && booking ? (
        <BookForm
          wards={wards}
          onBooked={async () => {
            setBooking(false);
            await refresh();
          }}
        />
      ) : null}
      {canBook && buys.length ? (
        <div className="tblwrap" style={{ marginTop: 14 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Buy</th>
                <th>Where</th>
                <th>Runs</th>
                <th style={{ textAlign: "right" }}>KES</th>
                <th>Finance</th>
                <th style={{ textAlign: "right" }}>Reach</th>
                <th style={{ textAlign: "right" }}>Per 1,000</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {buys.map((b) => {
                const cpm = costPerThousand(b.amountKes, b.reach);
                return (
                  <tr key={b.id}>
                    <td>
                      {b.name}
                      <div className="ref">{b.paidForBy}</div>
                    </td>
                    <td>
                      <span className={`ch ${platformInfo(b.platform).cls}`}>
                        {platformInfo(b.platform).code}
                      </span>{" "}
                      {b.wardName ?? "Whole seat"}
                    </td>
                    <td className="ref">
                      {day(b.startsOn)} – {day(b.endsOn)}
                    </td>
                    <td className="num">{nf.format(b.amountKes)}</td>
                    <td>
                      <span
                        className={`pill ${b.expenseStatus === "pending" ? "pill--amber" : "pill--ok"}`}
                      >
                        {b.expenseStatus ?? "—"}
                      </span>
                    </td>
                    <td className="num">{b.reach === null ? "—" : nf.format(b.reach)}</td>
                    <td className="num">{cpm === null ? "—" : nf.format(Math.round(cpm))}</td>
                    <td>
                      <Results buy={b} onSaved={refresh} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : canBook && data?.available ? (
        <p className="f-note" style={{ marginTop: 12 }}>
          Nothing booked yet. Each booking goes to Finance as an ads expense, against the spending
          limit.
        </p>
      ) : null}
    </div>
  );
}
