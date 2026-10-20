import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  addDays,
  cell,
  fortnight,
  mondayOf,
  nairobiToday,
  overdue,
  planTotals,
  SHIFTS,
  shortDay,
  unscheduled,
  wardNeeds,
  type PlanList,
  type Shift,
} from "@/lib/field-plan";
import { getFieldPlan, scheduleList } from "@/lib/field-plan.functions";
import { nf } from "@/lib/format";

const ABOUT =
  "Who knocks where over the next fortnight: walk lists by day and person, and what each ward still needs.";

export const Route = createFileRoute("/_authenticated/field-plan")({
  component: FieldPlan,
  head: () => ({
    meta: [
      { title: "Field plan · Groundwork" },
      { name: "description", content: ABOUT },
      { property: "og:title", content: "Field plan · Groundwork" },
      { property: "og:description", content: ABOUT },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SHIFT_LETTER: Record<Shift, string> = { morning: "AM", afternoon: "PM", day: "Day" };

function Chip({
  l,
  onPick,
  picked,
}: {
  l: PlanList;
  onPick: (l: PlanList) => void;
  picked: boolean;
}) {
  const pct = l.doors ? Math.round((100 * l.done) / l.doors) : 0;
  return (
    <button
      type="button"
      className="fp-chip"
      data-done={l.status === "done" || l.done >= l.doors}
      aria-pressed={picked}
      onClick={() => onPick(l)}
      title={`${l.name}: ${l.done} of ${l.doors} doors`}
    >
      <b>{l.name}</b>
      <span>
        {l.shift ? `${SHIFT_LETTER[l.shift]} · ` : ""}
        {l.done}/{l.doors}
      </span>
      <i style={{ width: `${pct}%` }} aria-hidden="true" />
    </button>
  );
}

function Editor({
  list,
  days,
  team,
  onDone,
}: {
  list: PlanList;
  days: string[];
  team: { userId: string; name: string; role: string }[];
  onDone: () => void;
}) {
  const save = useServerFn(scheduleList);
  const [dueOn, setDueOn] = useState(list.dueOn ?? "");
  const [shift, setShift] = useState<Shift>(list.shift ?? "day");
  const [to, setTo] = useState(list.givenTo ?? "");
  const m = useMutation({
    mutationFn: () =>
      save({
        data: { id: list.id, dueOn: dueOn || null, shift: dueOn ? shift : null, to: to || null },
      }),
    onSuccess: () => {
      toast.success(dueOn ? `Planned for ${shortDay(dueOn)}.` : "Taken off the plan.");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const choices = list.dueOn && !days.includes(list.dueOn) ? [list.dueOn, ...days] : days;
  return (
    <form
      className="card fp-editor"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      aria-label={`Plan ${list.name}`}
    >
      <div className="card-head">
        <h2>{list.name}</h2>
        <span className="mono">
          {[list.wardName, list.centreName].filter(Boolean).join(" · ")} · {list.done}/{list.doors}{" "}
          doors
        </span>
      </div>
      <div className="fp-fields">
        <label className="pb-field">
          <span>Day</span>
          <select value={dueOn} onChange={(e) => setDueOn(e.target.value)}>
            <option value="">No day yet</option>
            {choices.map((d) => (
              <option key={d} value={d}>
                {shortDay(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="pb-field">
          <span>Shift</span>
          <select
            value={shift}
            disabled={!dueOn}
            onChange={(e) => setShift(e.target.value as Shift)}
          >
            {SHIFTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pb-field">
          <span>Who walks it</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">{list.givenTo ? "Keep as it is" : "Not given yet"}</option>
            {team.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name} · {p.role}
              </option>
            ))}
          </select>
        </label>
        <div className="pm-actions">
          <button type="submit" className="btn btn--primary" disabled={m.isPending}>
            Save
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>
            Close
          </button>
        </div>
      </div>
    </form>
  );
}

function FieldPlan() {
  const today = nairobiToday();
  const [from, setFrom] = useState(mondayOf(today));
  const fetchPlan = useServerFn(getFieldPlan);
  const queryClient = useQueryClient();
  const { data, isError, error } = useQuery({
    queryKey: ["field-plan", from],
    queryFn: () => fetchPlan({ data: { from } }),
  });
  const [picked, setPicked] = useState<PlanList | null>(null);
  const [people, setPeople] = useState<number | null>(null);
  const [workDays, setWorkDays] = useState(10);
  const [perDay, setPerDay] = useState(100);
  const days = useMemo(() => fortnight(from), [from]);

  const agents = (data?.team ?? []).filter((p) => p.role === "agent").length;
  const headcount = people ?? Math.max(agents, 1);
  const needs = useMemo(
    () =>
      data ? wardNeeds(data.wards, { people: headcount, days: workDays, doorsPerDay: perDay }) : [],
    [data, headcount, workDays, perDay],
  );

  const refresh = async () => {
    setPicked(null);
    await queryClient.invalidateQueries({ queryKey: ["field-plan"] });
  };

  if (isError)
    return (
      <section className="view active" aria-label="Field plan">
        <div className="vh">
          <div>
            <span className="eyebrow">Field · field plan</span>
            <h1>Field plan</h1>
            <p className="meta">{(error as Error).message}</p>
          </div>
        </div>
      </section>
    );

  const t = data ? planTotals(data.wards) : null;
  const late = data ? overdue(data.lists, today) : [];
  const loose = data ? unscheduled(data.lists) : [];
  const rows: { id: string | null; name: string; role: string }[] = [
    ...(data?.team ?? []).map((p) => ({ id: p.userId, name: p.name, role: p.role })),
    { id: null, name: "Not given yet", role: "" },
  ];

  return (
    <section className="view active" aria-label="Field plan">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Field · field plan</span>
          <h1>
            Who knocks where, <span className="serif">this fortnight.</span>
          </h1>
          <p className="meta">
            {shortDay(days[0]!)} – {shortDay(days[13]!)} · Lists are made on the{" "}
            <Link to="/voters">Voters map</Link>; plan their days and people here.
          </p>
        </div>
        <div className="vh-side fp-nav">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setFrom(addDays(from, -14))}
          >
            ← Earlier
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setFrom(mondayOf(today))}
          >
            This fortnight
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setFrom(addDays(from, 14))}
          >
            Later →
          </button>
        </div>
      </div>

      {!data || !t ? (
        <p className="meta">Reading the plan…</p>
      ) : (
        <>
          <div className="g4 fx2">
            <div className="conn-item">
              <b>{nf.format(t.planned)}</b>
              <p>doors planned this fortnight</p>
            </div>
            <div className="conn-item">
              <b>{nf.format(t.knocked)}</b>
              <p>doors knocked · {nf.format(t.spoke)} conversations</p>
            </div>
            <div className="conn-item">
              <b>{nf.format(t.supporters)}</b>
              <p>supporters met (4 or 5 of 5)</p>
            </div>
            <div className="conn-item">
              <b>{nf.format(late.length)}</b>
              <p>
                {late.length === 1 ? "list past its day" : "lists past their day"} with doors left
              </p>
            </div>
          </div>

          {picked ? (
            <Editor key={picked.id} list={picked} days={days} team={data.team} onDone={refresh} />
          ) : null}

          <div className="card fx3" style={{ marginTop: 14 }}>
            <div className="card-head">
              <h2>The fortnight</h2>
              <span className="mono">tap a list to set its day, shift and person</span>
            </div>
            <div className="tblwrap">
              <table className="tbl fp-board">
                <thead>
                  <tr>
                    <th scope="col">Who</th>
                    {days.map((d) => (
                      <th key={d} scope="col" data-today={d === today}>
                        {shortDay(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id ?? "none"}>
                      <th scope="row">
                        {r.name}
                        {r.role ? <div className="ref">{r.role}</div> : null}
                      </th>
                      {days.map((d) => (
                        <td key={d} data-today={d === today}>
                          {cell(data.lists, r.id, d).map((l) => (
                            <Chip
                              key={l.id}
                              l={l}
                              picked={picked?.id === l.id}
                              onPick={setPicked}
                            />
                          ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.team.length === 0 ? (
              <p className="f-note">
                No one on the team yet. Invite agents from <Link to="/team">Team</Link>, then give
                them lists here.
              </p>
            ) : null}
          </div>

          <div className="card fx3" style={{ marginTop: 14 }}>
            <div className="card-head">
              <h2>Lists with no day yet</h2>
              <span className="mono">{loose.length} open</span>
            </div>
            {loose.length ? (
              <div className="fp-tray">
                {loose.map((l) => (
                  <Chip key={l.id} l={l} picked={picked?.id === l.id} onPick={setPicked} />
                ))}
              </div>
            ) : (
              <p className="f-note">
                Every open list has a day. Make more on the <Link to="/voters">Voters map</Link>:
                plan from a polling centre or draw a street.
              </p>
            )}
            {late.length ? (
              <>
                <h3 className="fp-sub">Past their day</h3>
                <div className="fp-tray">
                  {late.map((l) => (
                    <Chip key={l.id} l={l} picked={picked?.id === l.id} onPick={setPicked} />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="card fx4" style={{ marginTop: 14 }}>
            <div className="card-head">
              <h2>What each ward still needs</h2>
              <span className="mono">shared by each ward's vote target</span>
            </div>
            <div className="fp-fields fp-capacity">
              <label className="pb-field">
                <span>People knocking</span>
                <input
                  inputMode="numeric"
                  value={headcount}
                  onChange={(e) => setPeople(Number(e.target.value.replace(/\D/g, "")) || 0)}
                />
              </label>
              <label className="pb-field">
                <span>Days out of fourteen</span>
                <input
                  inputMode="numeric"
                  value={workDays}
                  onChange={(e) =>
                    setWorkDays(Math.min(14, Number(e.target.value.replace(/\D/g, "")) || 0))
                  }
                />
              </label>
              <label className="pb-field">
                <span>Doors a person a day</span>
                <input
                  inputMode="numeric"
                  value={perDay}
                  onChange={(e) =>
                    setPerDay(Math.min(400, Number(e.target.value.replace(/\D/g, "")) || 0))
                  }
                />
              </label>
            </div>
            <div className="tblwrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Ward</th>
                    <th style={{ textAlign: "right" }}>Vote target</th>
                    <th style={{ textAlign: "right" }}>Doors to plan</th>
                    <th style={{ textAlign: "right" }}>Planned</th>
                    <th style={{ textAlign: "right" }}>Knocked</th>
                    <th style={{ textAlign: "right" }}>Supporters met</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {needs.map((w) => (
                    <tr key={w.wardId}>
                      <td>{w.name}</td>
                      <td className="num">{w.targetVotes ? nf.format(w.targetVotes) : "—"}</td>
                      <td className="num">{nf.format(w.goal)}</td>
                      <td className="num">{nf.format(w.doorsPlanned)}</td>
                      <td className="num">{nf.format(w.doorsKnocked)}</td>
                      <td className="num">{nf.format(w.supporters)}</td>
                      <td>
                        {w.lists > 0 ? (
                          <Link
                            to="/voters"
                            search={{ area: `w:${w.slug}` } as never}
                            className="btn btn--ghost btn--sm"
                          >
                            Plan {w.lists} more {w.lists === 1 ? "list" : "lists"}
                          </Link>
                        ) : (
                          <span className="pill pill--ok">Planned</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="f-note">
              {nf.format(headcount)} {headcount === 1 ? "person" : "people"} × {workDays} days ×{" "}
              {perDay} doors is {nf.format(headcount * workDays * perDay)} doors, shared by each
              ward's vote target. A list holds about 50.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
