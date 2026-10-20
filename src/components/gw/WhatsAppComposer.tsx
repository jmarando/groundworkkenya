import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import type { BroadcastAudience } from "@/lib/broadcast.functions";
import {
  estimateWhatsApp,
  sendWhatsAppBroadcast,
  sendWhatsAppTest,
  uploadBroadcastImage,
} from "@/lib/wa-broadcast.functions";
import { rememberedPhone, rememberPhone } from "@/components/gw/CallProgress";
import { fillTemplate, WA_TEMPLATES_ALL } from "@/lib/wa-templates";
import { nf } from "@/lib/format";

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
  const [tpl, setTpl] = useState(WA_TEMPLATES_ALL[0]!.name);
  const t = WA_TEMPLATES_ALL.find((x) => x.name === tpl)!;
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const vals = fields[tpl] ?? t.fields.map(() => "");
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const imgUrl = t.image ? (imgUrls[tpl] ?? "").trim() : "";
  const [clientKey] = useState(() => crypto.randomUUID());
  const [progress, setProgress] = useState<{ sent: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(() => rememberedPhone());
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchEst = useServerFn(estimateWhatsApp);
  const send = useServerFn(sendWhatsAppBroadcast);
  const sendTest = useServerFn(sendWhatsAppTest);
  const upload = useServerFn(uploadBroadcastImage);
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
    : t.image && !/^https:\/\/\S+$/.test(imgUrl)
      ? "Add the picture."
      : est && recipients === 0
        ? "Nobody in this audience has agreed to WhatsApp."
        : null;

  async function pickImage(file: File) {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject(new Error("That picture couldn't be read."));
        r.readAsDataURL(file);
      });
      const { url } = await upload({ data: { type: file.type, base64 } });
      setImgUrls({ ...imgUrls, [tpl]: url });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function test() {
    setTesting(true);
    rememberPhone(phone);
    try {
      await sendTest({
        data: { template: tpl, fields: vals, imageUrl: imgUrl || undefined, phone },
      });
      setTested(true);
      toast.success("Sent to your WhatsApp. Check how it looks.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function go() {
    if (!window.confirm(`Send “${t.label}” on WhatsApp to ${nf.format(recipients)} people?`))
      return;
    setBusy(true);
    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;
    try {
      for (let round = 0; round < 200; round++) {
        const r = await send({
          data: { clientKey, template: tpl, fields: vals, imageUrl: imgUrl || undefined, audience },
        });
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
    } finally {
      setBusy(false);
    }
  }

  const done = progress ? progress.sent + progress.failed : 0;
  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="wa-title">
      <div className="pb pb--wide">
        <div className="pb-head">
          <div>
            <span className="eyebrow">Broadcast · WhatsApp</span>
            <h2 id="wa-title">Send an approved WhatsApp message</h2>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        </div>
        <div className="pb-body wa-grid">
          <div className="wa-steps">
            <ChannelTabs value="wa" onChange={onChannel} />
            <p className="f-note">
              To <b>{describe}</b> ·{" "}
              {est ? (
                <>
                  <b>{nf.format(recipients)}</b> agreed to WhatsApp
                </>
              ) : (
                "counting…"
              )}
            </p>

            <span className="kpi-lbl">1 · The message</span>
            <div className="wa-cards" role="radiogroup" aria-label="Approved message">
              {WA_TEMPLATES_ALL.map((x) => (
                <button
                  type="button"
                  role="radio"
                  key={x.name}
                  aria-checked={tpl === x.name}
                  className={`wa-card${tpl === x.name ? " is-on" : ""}`}
                  onClick={() => {
                    setTpl(x.name);
                    setTested(false);
                  }}
                >
                  <b>{x.label}</b>
                  <span className="meta">{x.text.replace(/\{\{\d\}\}/g, "…").slice(0, 70)}…</span>
                </button>
              ))}
            </div>

            {t.fields.length > 0 && <span className="kpi-lbl">2 · Fill in the blanks</span>}
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
                    setTested(false);
                  }}
                />
              </label>
            ))}
            {t.image && (
              <label className="pb-field">
                <span>The picture (JPG or PNG, up to 5 MB)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void pickImage(f);
                  }}
                />
                {uploading && <span className="f-note">Uploading…</span>}
              </label>
            )}

            <span className="kpi-lbl">3 · Send it to yourself first</span>
            <div className="ac-row">
              <input
                className="input"
                inputMode="tel"
                placeholder="Your WhatsApp number, 0712 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--sm"
                disabled={
                  Boolean(
                    problem && problem !== "Nobody in this audience has agreed to WhatsApp.",
                  ) ||
                  testing ||
                  !phone.trim()
                }
                onClick={() => void test()}
              >
                {testing ? "Sending…" : tested ? "Sent ✓ · again" : "Send me a test"}
              </button>
            </div>
          </div>

          <div className="wa-preview" aria-label="How it looks on WhatsApp">
            <div className="wa-bar">{est?.campaign ?? "The campaign"}</div>
            <div className="wa-chat">
              <div className="wa-bubble">
                {t.image &&
                  (/^https:\/\/\S+$/.test(imgUrl) ? (
                    <img src={imgUrl} alt="" />
                  ) : (
                    <div className="wa-img-empty">Picture</div>
                  ))}
                <p>{preview}</p>
                <span className="wa-time">now</span>
              </div>
            </div>
            <p className="f-note">
              Wording is fixed by Meta&apos;s approval; the first name and campaign fill in for each
              person.
            </p>
          </div>
        </div>
        <div className="pb-foot">
          <div className="wa-foot-status" aria-live="polite">
            {busy && progress ? (
              <>
                <div className="wa-progress">
                  <i
                    style={{
                      width: `${recipients ? Math.min(100, (done / recipients) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="f-note">
                  {nf.format(progress.sent)} sent
                  {progress.failed ? `, ${nf.format(progress.failed)} failed` : ""} of{" "}
                  {nf.format(recipients)}
                </span>
              </>
            ) : (
              <span className="f-note">
                {problem ??
                  `${nf.format(recipients)} ${recipients === 1 ? "person" : "people"} · billed by Meta per message${tested ? "" : " · test it first"}`}
              </span>
            )}
          </div>
          <button
            className="btn btn--primary"
            type="button"
            disabled={Boolean(problem) || busy}
            onClick={() => void go()}
          >
            {busy ? "Sending…" : `Send to ${nf.format(recipients)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
