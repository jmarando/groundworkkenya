// A door visit as the field app takes it: what happened, the support given, the issue raised and,
// for someone new, their name and number with the consent they gave. VisitSheet is the sheet over
// the ward's list; DoorVisit is the same form inline at a walk list's door, where no person is
// needed and "Add them" is the new-person path. The visit is built here and handed up to be sent,
// or kept on the phone when there is no signal.

import { useState } from "react";

import { DoorPlace } from "@/components/gw/DoorPlace";
import type { Fix } from "@/hooks/useDoorPlace";
import { useDoorPlace } from "@/hooks/useDoorPlace";
import { ISSUES, newVisitId, type Outcome, type Visit } from "@/lib/field";
import type { WalkEntry } from "@/lib/field.functions";
import { OUTCOME_LABEL } from "@/lib/houses";
import type { MapArea } from "@/lib/map-areas";
import { normalizeKePhone } from "@/lib/phone";
import { doorTitle, lastVisitText, saveLabel } from "@/lib/walk-list-run";
import type { DoorPerson, ListDoor, ListSummary } from "@/lib/walk-lists.functions";

const CONSENT_SOURCES = ["Told us at the door", "Signed a sign-up form"];
const BAD_PHONE = "Use a Kenyan mobile number like 0712 345 678.";

/** What a conversation at the door adds to a visit: the support, the issue and the consent given. */
function useSpoke() {
  const [support, setSupport] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [sms, setSms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [call, setCall] = useState(false);
  const [consentSource, setConsentSource] = useState(CONSENT_SOURCES[0] ?? "");
  return {
    support,
    setSupport,
    issue,
    setIssue,
    other,
    setOther,
    sms,
    setSms,
    whatsapp,
    setWhatsapp,
    call,
    setCall,
    consentSource,
    setConsentSource,
    anyConsent: sms || whatsapp || call,
  };
}
type Spoke = ReturnType<typeof useSpoke>;

/** The visit's fields from a conversation: nothing of it for a door where no one was spoken to. */
function spokeFields(s: Spoke, spoke: boolean, consent: boolean) {
  return {
    support: spoke ? s.support : null,
    issue: spoke ? (s.issue === "Other" ? s.other.trim() || null : s.issue) : null,
    consent:
      spoke && consent
        ? { sms: s.sms, whatsapp: s.whatsapp, call: s.call }
        : { sms: false, whatsapp: false, call: false },
    consentSource: spoke && consent && s.anyConsent ? s.consentSource : "",
  };
}

/** Support, the issue and, when someone is being added, the consent they gave. */
function SpokeFields({ s, consent }: { s: Spoke; consent: boolean }) {
  return (
    <>
      <fieldset className="pb-field">
        <legend>Support · 1 against, 5 with us</legend>
        <div className="pb-tags" role="group">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={`pb-tag fa-big${s.support === n ? " is-on" : ""}`}
              aria-pressed={s.support === n}
              onClick={() => s.setSupport(s.support === n ? null : n)}
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
              className={`pb-tag${s.issue === i ? " is-on" : ""}`}
              aria-pressed={s.issue === i}
              onClick={() => s.setIssue(s.issue === i ? null : i)}
            >
              {i}
            </button>
          ))}
        </div>
        {s.issue === "Other" && (
          <input
            value={s.other}
            maxLength={120}
            placeholder="In a few words"
            aria-label="The issue, in a few words"
            onChange={(e) => s.setOther(e.target.value)}
          />
        )}
      </fieldset>

      {consent && (
        <fieldset className="pb-field">
          <legend>They agreed to be contacted by</legend>
          <div className="ap-consent">
            <label>
              <input type="checkbox" checked={s.sms} onChange={(e) => s.setSms(e.target.checked)} />{" "}
              SMS
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.whatsapp}
                onChange={(e) => s.setWhatsapp(e.target.checked)}
              />{" "}
              WhatsApp
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.call}
                onChange={(e) => s.setCall(e.target.checked)}
              />{" "}
              Calls
            </label>
          </div>
          {s.anyConsent && (
            <select
              value={s.consentSource}
              aria-label="How they agreed"
              onChange={(e) => s.setConsentSource(e.target.value)}
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
      )}
    </>
  );
}

/** What happened at the door: three buttons. */
function Outcomes({
  outcome,
  onChange,
}: {
  outcome: Outcome | null;
  onChange: (o: Outcome) => void;
}) {
  return (
    <div className="fa-outcomes" role="group" aria-label="What happened">
      {(["spoke", "not_home", "refused"] as const).map((o) => (
        <button
          key={o}
          type="button"
          className={`fa-outcome${outcome === o ? " is-on" : ""}`}
          aria-pressed={outcome === o}
          onClick={() => onChange(o)}
        >
          {o === "spoke" ? "Spoke to them" : OUTCOME_LABEL[o]}
        </button>
      ))}
    </div>
  );
}

/** A new person's name, number and language. */
function NewPersonFields({
  name,
  setName,
  phone,
  setPhone,
  language,
  setLanguage,
}: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  language: "sw" | "en";
  setLanguage: (v: "sw" | "en") => void;
}) {
  return (
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
          <select value={language} onChange={(e) => setLanguage(e.target.value as "sw" | "en")}>
            <option value="sw">Kiswahili</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </>
  );
}

export function VisitSheet({
  person,
  wardId,
  area,
  onSave,
  onClose,
}: {
  person: WalkEntry | null;
  wardId: string;
  /**
   * The campaign's map area: null when it has none, and visits are placed by GPS alone;
   * undefined while its map config hasn't arrived.
   */
  area: MapArea | null | undefined;
  /** Resolves to a reason if the server refused the visit; the sheet then stays open. */
  onSave: (v: Visit) => Promise<string | null>;
  onClose: () => void;
}) {
  const isNew = person === null;
  const [outcome, setOutcome] = useState<Outcome | null>(isNew ? "spoke" : null);
  const spoken = useSpoke();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"sw" | "en">("sw");
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const door = useDoorPlace(area);

  const problem = !outcome
    ? "Choose what happened."
    : isNew && !name.trim()
      ? "Add their name."
      : isNew && !normalizeKePhone(phone)
        ? BAD_PHONE
        : null;

  const submit = async () => {
    if (problem || !outcome || saving) return;
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
      ...spokeFields(spoken, outcome === "spoke", true),
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
          <DoorPlace door={door} />

          {isNew ? (
            <NewPersonFields
              name={name}
              setName={setName}
              phone={phone}
              setPhone={setPhone}
              language={language}
              setLanguage={setLanguage}
            />
          ) : (
            <Outcomes outcome={outcome} onChange={setOutcome} />
          )}

          {outcome === "spoke" && <SpokeFields s={spoken} consent />}
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

/**
 * This door of a walk list, inline under the list's map: who is on file here, what happened at the
 * door and, if someone was met, their support and issue, and "Add them" with the consent they gave.
 * The visit is recorded at this house and with this list; no person unless one is added. Mount it
 * with the door's plus code as its key, so each door starts clean.
 */
export function DoorVisit({
  list,
  door,
  total,
  people,
  footprintNote,
  nextN,
  fix,
  onSave,
  onSkip,
}: {
  list: ListSummary;
  door: ListDoor;
  total: number;
  /** The people on file at this house. */
  people: DoorPerson[];
  /** Said when the house is big enough to be a block of flats; null otherwise. */
  footprintNote: string | null;
  /** The number of the door the Save button goes to next; null when this is the last one. */
  nextN: number | null;
  /** Where the phone is, for the visit's place; null when it has no fix. */
  fix: Fix | null;
  /** Resolves to a reason if the server refused the visit; the form then stays as it was. */
  onSave: (v: Visit) => Promise<string | null>;
  onSkip: () => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const spoken = useSpoke();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"sw" | "en">("sw");
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const spoke = outcome === "spoke";
  const addingThem = adding && spoke;
  const problem = !outcome
    ? "Choose what happened."
    : addingThem && !name.trim()
      ? "Add their name."
      : addingThem && !normalizeKePhone(phone)
        ? BAD_PHONE
        : null;

  const submit = async () => {
    if (problem || !outcome || saving) return;
    setSaving(true);
    setRefused(null);
    const reason = await onSave({
      clientId: newVisitId(),
      personId: null,
      newPerson: addingThem
        ? { phone, name: name.trim(), ward_id: door.wardId ?? list.wardId, segment: null, language }
        : null,
      outcome,
      ...spokeFields(spoken, spoke, addingThem),
      visitedAt: new Date().toISOString(),
      label: `${list.name} · door ${door.n}`,
      place: fix
        ? {
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy === null ? null : Math.round(fix.accuracy),
            buildingId: door.pc,
          }
        : null,
      walkListId: list.id,
      doorPc: door.pc,
    });
    setSaving(false);
    setRefused(reason);
  };

  return (
    <section className="wl-door" aria-label="This door">
      <div className="card-head">
        <h3>{doorTitle(door.n, total)}</h3>
        <span className="mono">{lastVisitText(door.outcome, door.visitedAt)}</span>
      </div>
      {footprintNote ? <p className="vhouse-note">{footprintNote}</p> : null}
      {people.length ? (
        <ul className="wl-people" aria-label="On file at this house">
          {people.map((p) => (
            <li key={p.id}>
              <b>{p.name}</b>
              <a className="mono" href={`tel:${p.phone}`}>
                {p.phone}
              </a>
              {p.support > 0 ? <small>support {p.support} of 5</small> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">No one is on file at this house yet.</p>
      )}

      <Outcomes outcome={outcome} onChange={setOutcome} />

      {spoke && (
        <>
          <SpokeFields s={spoken} consent={addingThem} />
          {addingThem ? (
            <>
              <NewPersonFields
                name={name}
                setName={setName}
                phone={phone}
                setPhone={setPhone}
                language={language}
                setLanguage={setLanguage}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setAdding(false)}
              >
                Don't add them
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => setAdding(true)}>
              Add them
            </button>
          )}
        </>
      )}

      <p className={`f-note${refused && !problem ? " f-err" : ""}`} aria-live="polite">
        {problem ?? refused ?? "Saved with the time of this visit, even if you sync later."}
      </p>
      <div className="wl-actions">
        <button
          className="btn btn--primary"
          type="button"
          disabled={Boolean(problem) || saving}
          onClick={() => void submit()}
        >
          {saving ? "Saving…" : saveLabel(nextN)}
        </button>
        <button className="btn btn--ghost" type="button" disabled={saving} onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </section>
  );
}
