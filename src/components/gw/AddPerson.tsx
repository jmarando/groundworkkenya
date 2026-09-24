import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { normalizeKePhone } from "@/lib/phone";
import { addPerson } from "@/lib/people.functions";

/** How someone agreed to be contacted. The one chosen goes on their record. */
const CONSENT_SOURCES = [
  "Told us in person",
  "Signed a sign-up form",
  "Texted or called the campaign",
  "Filled in an online form",
];

export function AddPerson({
  wards,
  segments,
  onClose,
}: {
  wards: { id: string; name: string; constituency: string }[];
  segments: { slug: string; name: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [wardId, setWardId] = useState("");
  const [segment, setSegment] = useState("");
  const [language, setLanguage] = useState<"sw" | "en">("sw");
  const [support, setSupport] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [notes, setNotes] = useState("");
  const [sms, setSms] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [call, setCall] = useState(false);
  const [consentSource, setConsentSource] = useState("");

  const save = useServerFn(addPerson);
  const queryClient = useQueryClient();

  const anyConsent = sms || whatsapp || call;
  const normalised = normalizeKePhone(phone);
  const problem = !name.trim()
    ? "Add their name."
    : !normalised
      ? "Use a Kenyan mobile number like 0712 345 678."
      : anyConsent && !consentSource
        ? "Say how they agreed to be contacted."
        : null;

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          name,
          phone,
          wardId: wardId || null,
          segment: segment || null,
          language,
          support,
          notes,
          consent: { sms, whatsapp, call },
          consentSource: anyConsent ? consentSource : "",
        },
      }),
    onSuccess: async () => {
      toast.success(`${name.trim()} added.`);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="ap-title">
      <form
        className="pb"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) mutation.mutate();
        }}
      >
        <div className="pb-head">
          <div>
            <span className="eyebrow">People · add</span>
            <h2 id="ap-title">One person, one record.</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="pb-body">
          <div className="pb-row pb-row--2">
            <label className="pb-field">
              <span>Name</span>
              <input
                value={name}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
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
          </div>

          <div className="pb-row">
            <label className="pb-field">
              <span>Ward</span>
              <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
                <option value="">Not known</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.constituency}
                  </option>
                ))}
              </select>
            </label>
            <label className="pb-field">
              <span>Group</span>
              <select value={segment} onChange={(e) => setSegment(e.target.value)}>
                <option value="">None</option>
                {segments.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pb-field">
              <span>Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value as "sw" | "en")}>
                <option value="sw">Kiswahili</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          <fieldset className="pb-field">
            <legend>Support · 1 against, 5 with us</legend>
            <div className="pb-tags" role="group">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`pb-tag${support === n ? " is-on" : ""}`}
                  aria-pressed={support === n}
                  onClick={() => setSupport(support === n ? null : n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="pb-field">
            <legend>They agreed to be contacted by</legend>
            <div className="ap-consent">
              <label>
                <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />{" "}
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
                <input type="checkbox" checked={call} onChange={(e) => setCall(e.target.checked)} />{" "}
                Calls
              </label>
            </div>
            {anyConsent && (
              <label className="pb-field">
                <span>How did they agree?</span>
                <select value={consentSource} onChange={(e) => setConsentSource(e.target.value)}>
                  <option value="">Choose one</option>
                  {CONSENT_SOURCES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="f-note">
              Only tick what they actually agreed to. It goes on their record with your name and the
              time. Leave all three blank if you are not sure.
            </p>
          </fieldset>

          <label className="pb-field">
            <span>Notes</span>
            <textarea
              rows={2}
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="pb-foot">
          <p className="f-note" aria-live="polite">
            {problem ?? `Saving as ${normalised}.`}
          </p>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={Boolean(problem) || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Add person"}
          </button>
        </div>
      </form>
    </div>
  );
}
