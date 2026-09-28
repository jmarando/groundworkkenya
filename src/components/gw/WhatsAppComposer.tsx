import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import type { BroadcastAudience } from "@/lib/broadcast.functions";
import { estimateWhatsApp, sendWhatsAppBroadcast } from "@/lib/wa-broadcast.functions";
import { fillTemplate, WA_TEMPLATES } from "@/lib/wa-templates";

const nf = new Intl.NumberFormat("en-KE");

export function ChannelTabs({
  value,
  onChange,
}: {
  value: "sms" | "wa";
  onChange: (v: "sms" | "wa") => void;
}) {
  return (
    <div className="bc-tabs" role="tablist" aria-label="Channel">
      {(["sms", "wa"] as const).map((c) => (
        <button
          key={c}
          type="button"
          role="tab"
          aria-selected={value === c}
          className={`btn btn--sm ${value === c ? "btn--primary" : "btn--ghost"}`}
          onClick={() => onChange(c)}
        >
          {c === "sms" ? "SMS" : "WhatsApp"}
        </button>
      ))}
    </div>
  );
}

export function WhatsAppComposer({
  audience,
  describe,
  onChannel,
  onClose,
}: {
  audience: BroadcastAudience;
  describe: string;
  onChannel: (v: "sms" | "wa") => void;
  onClose: () => void;
}) {
  const [tpl, setTpl] = useState(WA_TEMPLATES[0]!.name);
  const t = WA_TEMPLATES.find((x) => x.name === tpl)!;
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const vals = fields[tpl] ?? t.fields.map(() => "");
  const [reviewing, setReviewing] = useState(false);
  const [clientKey] = useState(() => crypto.randomUUID());
  const [progress, setProgress] = useState<{ sent: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchEst = useServerFn(estimateWhatsApp);
  const send = useServerFn(sendWhatsAppBroadcast);
  const qc = useQueryClient();
  const { data: est } = useQuery({
    queryKey: ["wa-estimate", audience],
    queryFn: () => fetchEst({ data: audience }),
  });
  const recipients = est?.reachable ?? 0;
  const preview = fillTemplate(t.text, [
    "Mary",
    est?.campaign ?? "…",
    ...vals.map((v, i) => v || `[${t.fields[i]?.label}]`),
  ]);

  const problem = vals.some((v) => !v.trim())
    ? "Fill in every blank."
    : est && recipients === 0
      ? "Nobody in this audience has agreed to WhatsApp."
      : null;

  async function go() {
    setBusy(true);
    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;
    try {
      for (let round = 0; round < 200; round++) {
        const r = await send({ data: { clientKey, template: tpl, fields: vals, audience } });
        sent += r.sent;
        failed += r.failed;
        lastError = r.lastError ?? lastError;
        setProgress({ sent, failed });
        if (r.remaining <= 0 || r.sent + r.failed === 0) break;
        // Everything failing means the account or template is refused; stop.
        if (r.sent === 0) break;
      }
      if (sent) toast.success(`Sent on WhatsApp to ${nf.format(sent)} people.`);
      if (failed)
        toast.error(`${nf.format(failed)} could not be sent.`, {
          description: lastError ?? undefined,
        });
      if (!sent && !failed) toast.info("Everyone in this audience already got it.");
      await qc.invalidateQueries({ queryKey: ["broadcast"] });
      await qc.invalidateQueries({ queryKey: ["inbox"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
      setReviewing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="wa-title">
      <div className="pb">
        <div className="pb-head">
          <div>
            <span className="eyebrow">Broadcast · WhatsApp</span>
            <h2 id="wa-title">
              {reviewing ? "Check it, then send." : "Pick an approved message."}
            </h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body">
          <ChannelTabs value="wa" onChange={onChannel} />
          <div className="bc-audience">
            <span className="eyebrow">To</span>
            <p>
              <b>{describe}</b>
            </p>
            <p className="f-note">
              {est ? (
                <>
                  <b>{nf.format(recipients)} have agreed to WhatsApp</b> and will get it. Opted-out
                  people are skipped.
                </>
              ) : (
                "Counting the audience…"
              )}
            </p>
          </div>

          {!reviewing && (
            <>
              <label className="pb-field">
                <span>Message</span>
                <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
                  {WA_TEMPLATES.map((x) => (
                    <option key={x.name} value={x.name}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              {t.fields.map((f, i) => (
                <label className="pb-field" key={f.label}>
                  <span>{f.label}</span>
                  <input
                    value={vals[i]}
                    placeholder={f.placeholder}
                    maxLength={200}
                    onChange={(e) => {
                      const next = [...vals];
                      next[i] = e.target.value;
                      setFields({ ...fields, [tpl]: next });
                    }}
                  />
                </label>
              ))}
            </>
          )}

          <div className="bc-phone" aria-label="Message preview">
            <p>{preview}</p>
          </div>
          <p className="f-note">
            Wording is fixed by Meta's approval. Each person's first name and the campaign name are
            filled in automatically.
          </p>
        </div>
        <div className="pb-foot">
          <p className="f-note" aria-live="polite">
            {busy && progress
              ? `Sending… ${nf.format(progress.sent)} sent${progress.failed ? `, ${nf.format(progress.failed)} failed` : ""}`
              : (problem ??
                `${nf.format(recipients)} ${recipients === 1 ? "person" : "people"} · billed by Meta per message`)}
          </p>
          {reviewing ? (
            <div className="bc-actions">
              <button
                className="btn btn--ghost"
                type="button"
                disabled={busy}
                onClick={() => setReviewing(false)}
              >
                Edit
              </button>
              <button
                className="btn btn--primary"
                type="button"
                disabled={Boolean(problem) || busy}
                onClick={go}
              >
                {busy ? "Sending…" : `Send to ${nf.format(recipients)}`}
              </button>
            </div>
          ) : (
            <button
              className="btn btn--primary"
              type="button"
              disabled={Boolean(problem)}
              onClick={() => setReviewing(true)}
            >
              Review
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
