import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DoorPlace } from "@/components/gw/DoorPlace";
import { useDoorPlace } from "@/hooks/useDoorPlace";
import {
  isNetworkError,
  ISSUES,
  mergeAfterSync,
  newVisitId,
  queueStore,
  syncQueue,
  withoutProblem,
  type KeyValue,
  type Outcome,
  type Queued,
  type QueueStore,
  type Visit,
} from "@/lib/field";
import { getWalkList, recordVisit, type WalkEntry } from "@/lib/field.functions";
import { toBuildings, type Building } from "@/lib/geo";
import { buildingsIndexQuery, wardBuildingsQuery } from "@/lib/geo-files";
import { normalizeKePhone } from "@/lib/phone";

const WARD_KEY = "gw-field-ward";

/** localStorage, or nothing if the browser refuses it (private mode, blocked site data). */
function storage(): KeyValue | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  spoke: "Spoke",
  not_home: "Not home",
  refused: "Refused",
};

export function FieldApp({
  wards,
}: {
  wards: { id: string; slug: string; name: string; constituency: string }[];
}) {
  const queryClient = useQueryClient();
  const fetchWalk = useServerFn(getWalkList);
  const record = useServerFn(recordVisit);

  const [wardId, setWardId] = useState("");
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<{ person: WalkEntry | null } | null>(null);

  // Where visits wait, made on first use in the browser.
  const storeRef = useRef<QueueStore | null>(null);
  const store = useCallback(() => (storeRef.current ??= queueStore(storage())), []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setQueue(store().read());
    try {
      setWardId(storage()?.getItem(WARD_KEY) ?? "");
    } catch {
      // No remembered ward: the agent picks one.
    }
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [store]);

  const chooseWard = (id: string) => {
    setWardId(id);
    setSearch("");
    try {
      storage()?.setItem(WARD_KEY, id);
    } catch {
      // A remembered ward is a convenience; losing it costs one tap.
    }
  };

  const {
    data: list,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["walk-list", wardId],
    queryFn: () => fetchWalk({ data: { wardId } }),
    enabled: Boolean(wardId),
    staleTime: 60_000,
  });

  const ward = wards.find((w) => w.id === wardId);

  // Building outlines, so a visit lands on the right building. Fetched once
  // while there is signal and kept for the session.
  const { data: index } = useQuery(buildingsIndexQuery);
  const slug = ward?.slug ?? "";
  const hasOutlines = Boolean(slug && index?.wards[slug]);
  const { data: outlines } = useQuery({ ...wardBuildingsQuery(slug), enabled: hasOutlines });
  const buildings = useMemo(
    () => (hasOutlines && outlines ? toBuildings(outlines) : []),
    [hasOutlines, outlines],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [list, search]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["walk-list"] });
    await queryClient.invalidateQueries({ queryKey: ["voters"] });
  }, [queryClient]);

  // A ref, not state, guards the run: if the flag were a dependency, every
  // failed sync would rebuild this function and re-trigger the effect below,
  // retrying in a tight loop on a phone that says "online" but can't connect.
  const inFlight = useRef(false);
  const sync = useCallback(async () => {
    if (inFlight.current) return;
    const snapshot = store().read();
    if (!snapshot.some((q) => !q.problem)) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      const { queue: left, result } = await syncQueue(snapshot, (v) => record({ data: v }));
      // Visits saved while the run was out keep their place in the queue.
      const next = mergeAfterSync(snapshot, left, store().read());
      store().write(next);
      setQueue(next);
      if (result.sent) {
        toast.success(`${result.sent} visit${result.sent === 1 ? "" : "s"} synced.`);
        await refresh();
      }
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [record, refresh, store]);

  const waiting = queue.filter((q) => !q.problem).length;
  const problems = queue.filter((q) => q.problem);

  // Send what is waiting as soon as there is signal, and keep trying.
  useEffect(() => {
    if (!online || waiting === 0) return;
    void sync();
    const t = window.setInterval(() => void sync(), 30_000);
    return () => window.clearInterval(t);
  }, [online, waiting, sync]);

  const keep = (visit: Visit) => {
    const next = [...store().read(), visit];
    const saved = store().write(next);
    setQueue(next);
    toast.success("Saved on this phone. It syncs when there is signal.", {
      description: saved
        ? undefined
        : "This browser will not keep it if the page is closed: sync before you leave.",
    });
  };

  /**
   * Send a visit, or keep it on the phone when there is no signal. Resolves
   * to the server's reason when it refuses the visit, so the sheet can stay
   * open with everything the agent entered.
   */
  const save = async (visit: Visit): Promise<string | null> => {
    if (!navigator.onLine) {
      setOpen(null);
      keep(visit);
      return null;
    }
    try {
      const r = await record({ data: visit });
      setOpen(null);
      toast.success(r.created ? `${visit.label} signed up.` : `Saved: ${visit.label}.`, {
        description: r.consentBlocked
          ? "They had replied STOP before, so consent was not recorded. They can text START to rejoin."
          : undefined,
      });
      await refresh();
      return null;
    } catch (e) {
      if (isNetworkError(e)) {
        setOpen(null);
        keep(visit);
        return null;
      }
      const reason = e instanceof Error ? e.message : "Could not save the visit.";
      // Also as a toast, in case the sheet was closed while this was sending.
      toast.error(reason);
      return reason;
    }
  };

  const discard = (clientId: string) => {
    const next = store()
      .read()
      .filter((q) => q.clientId !== clientId);
    store().write(next);
    setQueue(next);
  };

  // A refusal can be a passing fault (a server error mid-sync): let the agent send it again.
  const retry = (clientId: string) => {
    const next = store()
      .read()
      .map((q) => (q.clientId === clientId ? withoutProblem(q) : q));
    store().write(next);
    setQueue(next);
  };

  return (
    <div className="fa">
      <div className="fa-bar">
        <label className="fa-ward">
          <span className="eyebrow">Ward</span>
          <select value={wardId} onChange={(e) => chooseWard(e.target.value)}>
            <option value="">Choose your ward</option>
            {wards.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.constituency}
              </option>
            ))}
          </select>
        </label>
        <span className={`fa-net${online ? "" : " is-off"}`} role="status">
          {online ? "Online" : "No signal"}
          {waiting > 0 && ` · ${waiting} waiting`}
        </span>
      </div>

      {waiting > 0 && online && (
        <button
          className="btn btn--ghost btn--sm"
          type="button"
          disabled={syncing}
          onClick={() => void sync()}
        >
          {syncing ? "Syncing…" : `Sync ${waiting} now`}
        </button>
      )}

      {problems.length > 0 && (
        <div className="fa-problems" role="alert">
          <b>Not saved — check these:</b>
          <ul>
            {problems.map((p) => (
              <li key={p.clientId}>
                <span>
                  {p.label}: {p.problem}
                </span>
                <span className="fa-problem-actions">
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    onClick={() => retry(p.clientId)}
                  >
                    Try again
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    onClick={() => discard(p.clientId)}
                  >
                    Discard
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {wardId ? (
        <>
          <div className="fa-tools">
            <input
              type="search"
              value={search}
              placeholder="Find a name"
              aria-label="Find a name on the walk list"
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => setOpen({ person: null })}
            >
              New person
            </button>
          </div>

          {isError && (
            <p className="f-note">
              Could not load the walk list. New people can still be signed up.
            </p>
          )}
          {!list && isFetching && <p className="f-note">Loading {ward?.name ?? "the ward"}…</p>}
          {list && (
            <p className="f-note">
              {list.length} on the list · not reached yet first · anyone who refused in the last 30
              days is left off
            </p>
          )}

          <ul className="fa-list">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" className="fa-person" onClick={() => setOpen({ person: p })}>
                  <b>{p.name}</b>
                  <span className="mono">{p.phoneMasked}</span>
                  <small>
                    {p.lastOutcome
                      ? `${OUTCOME_TEXT[p.lastOutcome]} ${ago(p.lastVisitAt)}`
                      : p.lastContactedAt
                        ? `Last contact ${ago(p.lastContactedAt)}`
                        : "Not reached yet"}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {list && shown.length === 0 && <p className="f-note">No one matches that name.</p>}
        </>
      ) : (
        <p className="f-note">Choose your ward to see who to visit.</p>
      )}

      {open && wardId && (
        <VisitSheet
          person={open.person}
          wardId={wardId}
          buildings={buildings}
          outlines={!hasOutlines ? "none" : outlines ? "ready" : "loading"}
          onSave={save}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

const CONSENT_SOURCES = ["Told us at the door", "Signed a sign-up form"];

function VisitSheet({
  person,
  wardId,
  buildings,
  outlines,
  onSave,
  onClose,
}: {
  person: WalkEntry | null;
  wardId: string;
  buildings: Building[];
  outlines: "none" | "loading" | "ready";
  /** Resolves to a reason if the server refused the visit; the sheet then stays open. */
  onSave: (v: Visit) => Promise<string | null>;
  onClose: () => void;
}) {
  const isNew = person === null;
  const [outcome, setOutcome] = useState<Outcome | null>(isNew ? "spoke" : null);
  const [support, setSupport] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [sms, setSms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [call, setCall] = useState(false);
  const [consentSource, setConsentSource] = useState(CONSENT_SOURCES[0] ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"sw" | "en">("sw");
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const door = useDoorPlace(buildings);

  const anyConsent = sms || whatsapp || call;
  const problem = !outcome
    ? "Choose what happened."
    : isNew && !name.trim()
      ? "Add their name."
      : isNew && !normalizeKePhone(phone)
        ? "Use a Kenyan mobile number like 0712 345 678."
        : null;

  const submit = async () => {
    if (problem || !outcome || saving) return;
    const spoke = outcome === "spoke";
    const label = isNew ? name.trim() : person.name;
    setSaving(true);
    setRefused(null);
    const reason = await onSave({
      clientId: newVisitId(),
      personId: isNew ? null : person.id,
      newPerson: isNew
        ? { phone, name: name.trim(), ward_id: wardId, segment: null, language }
        : null,
      outcome,
      support: spoke ? support : null,
      issue: spoke ? (issue === "Other" ? other.trim() || null : issue) : null,
      consent: spoke ? { sms, whatsapp, call } : { sms: false, whatsapp: false, call: false },
      consentSource: spoke && anyConsent ? consentSource : "",
      visitedAt: new Date().toISOString(),
      label,
      place: door.place,
    });
    setSaving(false);
    setRefused(reason);
  };

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="vs-title">
      <div className="pb fa-sheet">
        <div className="pb-head">
          <div>
            <span className="eyebrow">{isNew ? "New person" : "Door visit"}</span>
            <h2 id="vs-title">{isNew ? "Who did you meet?" : person.name}</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="pb-body">
          <DoorPlace door={door} buildings={buildings} outlines={outlines} />

          {isNew ? (
            <>
              <label className="pb-field">
                <span>Name</span>
                <input
                  value={name}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="pb-row pb-row--2">
                <label className="pb-field">
                  <span>Mobile number</span>
                  <input
                    value={phone}
                    inputMode="tel"
                    placeholder="0712 345 678"
                    autoComplete="off"
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <label className="pb-field">
                  <span>Language</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "sw" | "en")}
                  >
                    <option value="sw">Kiswahili</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
            </>
          ) : (
            <div className="fa-outcomes" role="group" aria-label="What happened">
              {(["spoke", "not_home", "refused"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`fa-outcome${outcome === o ? " is-on" : ""}`}
                  aria-pressed={outcome === o}
                  onClick={() => setOutcome(o)}
                >
                  {o === "spoke" ? "Spoke to them" : OUTCOME_TEXT[o]}
                </button>
              ))}
            </div>
          )}

          {outcome === "spoke" && (
            <>
              <fieldset className="pb-field">
                <legend>Support · 1 against, 5 with us</legend>
                <div className="pb-tags" role="group">
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`pb-tag fa-big${support === n ? " is-on" : ""}`}
                      aria-pressed={support === n}
                      onClick={() => setSupport(support === n ? null : n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="pb-field">
                <legend>The issue they raised</legend>
                <div className="pb-tags" role="group">
                  {[...ISSUES, "Other"].map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={`pb-tag${issue === i ? " is-on" : ""}`}
                      aria-pressed={issue === i}
                      onClick={() => setIssue(issue === i ? null : i)}
                    >
                      {i}
                    </button>
                  ))}
                </div>
                {issue === "Other" && (
                  <input
                    value={other}
                    maxLength={120}
                    placeholder="In a few words"
                    aria-label="The issue, in a few words"
                    onChange={(e) => setOther(e.target.value)}
                  />
                )}
              </fieldset>

              <fieldset className="pb-field">
                <legend>They agreed to be contacted by</legend>
                <div className="ap-consent">
                  <label>
                    <input
                      type="checkbox"
                      checked={sms}
                      onChange={(e) => setSms(e.target.checked)}
                    />{" "}
                    SMS
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.checked)}
                    />{" "}
                    WhatsApp
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={call}
                      onChange={(e) => setCall(e.target.checked)}
                    />{" "}
                    Calls
                  </label>
                </div>
                {anyConsent && (
                  <select
                    value={consentSource}
                    aria-label="How they agreed"
                    onChange={(e) => setConsentSource(e.target.value)}
                  >
                    {CONSENT_SOURCES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                <p className="f-note">
                  Only tick what they said yes to. It goes on their record with your name.
                </p>
              </fieldset>
            </>
          )}
        </div>

        <div className="pb-foot">
          <p className={`f-note${refused && !problem ? " f-err" : ""}`} aria-live="polite">
            {problem ?? refused ?? "Saved with the time of this visit, even if you sync later."}
          </p>
          <button
            className="btn btn--primary"
            type="button"
            disabled={Boolean(problem) || saving}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
