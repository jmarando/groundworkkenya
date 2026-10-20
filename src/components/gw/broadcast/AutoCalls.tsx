// Broadcast's auto-calls: the candidate's voice, a new recorded message, a test call to your own
// phone, then the calls to the audience, followed live. src/lib/autocall.functions.ts does the
// work; only people who agreed to calls are rung, and pressing 9 stops their calls.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { CallProgress, rememberedPhone, rememberPhone } from "@/components/gw/CallProgress";
import { QueryState } from "@/components/gw/QueryState";
import {
  cloneCandidateVoice,
  countCallable,
  getAutoCalls,
  getBlastCalls,
  removeCandidateVoice,
  saveBlast,
  sendBlast,
  testBlast,
  type AutoCallData,
  type Blast,
} from "@/lib/autocall.functions";
import type { BroadcastAudience } from "@/lib/broadcast.functions";
import { speakingSeconds } from "@/lib/call-status";
import { nf, stamp } from "@/lib/format";

type Upload = { name: string; type: string; base64: string };

const readFile = (f: File): Promise<Upload> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () =>
      resolve({
        name: f.name,
        type: f.type || "audio/mpeg",
        base64: String(r.result).split(",")[1] ?? "",
      });
    r.onerror = () => reject(new Error("That file couldn't be read."));
    r.readAsDataURL(f);
  });

export function AutoCalls({
  audience,
  describe,
}: {
  audience: BroadcastAudience;
  describe: string;
}) {
  const fetchData = useServerFn(getAutoCalls);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["autocalls"],
    queryFn: () => fetchData(),
  });
  const [selected, setSelected] = useState<string | null>(null);
  if (!data)
    return (
      <QueryState
        isLoading={isLoading}
        isError={isError}
        retry={() => void refetch()}
        what="auto-calls"
      />
    );
  const blast = data.blasts.find((b) => b.id === (selected ?? data.blasts[0]?.id)) ?? null;
  return (
    <div className="ac">
      <Readiness data={data} />
      <div className="g2" style={{ marginTop: 14 }}>
        <Voice data={data} />
        {data.canWrite && <NewBlast data={data} onMade={setSelected} />}
      </div>
      {blast && (
        <BlastPanel
          key={blast.id}
          blast={blast}
          data={data}
          audience={audience}
          describe={describe}
        />
      )}
      {data.blasts.length > 1 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2>Auto-calls made</h2>
          </div>
          <ul className="ac-list">
            {data.blasts.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={`ac-item${b.id === blast?.id ? " is-on" : ""}`}
                  onClick={() => setSelected(b.id)}
                >
                  <b>{b.title}</b>
                  <span className="meta">
                    {stamp(b.createdAt)} · {b.status === "done" ? "finished" : b.status}
                    {b.tally.total
                      ? ` · ${nf.format(b.tally.total)} called, ${nf.format(b.tally.answered)} answered`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Readiness({ data }: { data: AutoCallData }) {
  const items = [
    {
      ok: data.ready.twilio,
      yes: `Calls go out from ${data.from ?? "the campaign's Twilio number"}`,
      no: "Twilio number not set (TWILIO_FROM_NUMBER)",
    },
    {
      ok: data.ready.reports,
      yes: "Every call is followed to its end",
      no: "Call reports not set up (TWILIO_CALLBACK_TOKEN)",
    },
    {
      ok: data.ready.voice,
      yes: "Voice cloning connected",
      no: "Voice cloning not connected (ELEVENLABS_API_KEY): recordings and the standard voice still work",
    },
  ];
  return (
    <div className="ac-ready">
      {items.map((i) => (
        <span key={i.yes} className={`ac-ready-item ${i.ok ? "is-ok" : "is-off"}`}>
          <span aria-hidden="true">{i.ok ? "●" : "○"}</span> {i.ok ? i.yes : i.no}
        </span>
      ))}
    </div>
  );
}

function Voice({ data }: { data: AutoCallData }) {
  const qc = useQueryClient();
  const clone = useServerFn(cloneCandidateVoice);
  const remove = useServerFn(removeCandidateVoice);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const cloning = useMutation({
    mutationFn: async () =>
      clone({
        data: {
          name: `${data.candidate} (campaign calls)`,
          consentNote: note,
          files: await Promise.all(files.map(readFile)),
        },
      }),
    onSuccess: async () => {
      toast.success(`${data.candidate}'s voice is ready.`);
      setFiles([]);
      await qc.invalidateQueries({ queryKey: ["autocalls"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removing = useMutation({
    mutationFn: () => remove(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autocalls"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const total = files.reduce((t, f) => t + f.size, 0);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{data.candidate}&apos;s voice</h2>
          <p className="meta">Auto-calls can speak a script in the candidate&apos;s own voice.</p>
        </div>
      </div>
      {data.voice ? (
        <>
          <p>
            <span className="pill pill--ok">Ready</span> <b>{data.voice.name}</b>
            <span className="meta"> · cloned {stamp(data.voice.createdAt)}</span>
          </p>
          {data.canWrite && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={removing.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Remove the cloned voice? Auto-calls already made keep their audio.",
                  )
                )
                  removing.mutate();
              }}
            >
              Remove the voice
            </button>
          )}
        </>
      ) : !data.canWrite ? (
        <p className="f-note">Not set up yet. The candidate or a manager clones it here.</p>
      ) : (
        <div className="auth-form">
          <ol className="ac-howto">
            <li>
              Record the candidate reading anything for 1 to 3 minutes: a quiet room, phone close,
              no music.
            </li>
            <li>Upload one to five recordings (MP3, M4A or WAV).</li>
            <li>
              Say how the candidate agreed. The voice is used only for this campaign&apos;s calls.
            </li>
          </ol>
          <label className="auth-field">
            <span>Recordings</span>
            <input
              type="file"
              accept="audio/*"
              multiple
              onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 5))}
            />
          </label>
          {files.length > 0 && (
            <p className="f-note">
              {files.length} {files.length === 1 ? "file" : "files"} ·{" "}
              {(total / 1_000_000).toFixed(1)} MB
            </p>
          )}
          <label className="auth-field">
            <span>The candidate&apos;s consent</span>
            <textarea
              rows={2}
              value={note}
              maxLength={1000}
              placeholder="e.g. Agreed in writing to the campaign manager on 20 October 2026; recorded at the office."
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="ac-check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />{" "}
            {data.candidate} has agreed to their voice being cloned for the campaign&apos;s calls.
          </label>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={
              !data.ready.voice ||
              !agreed ||
              !files.length ||
              note.trim().length < 10 ||
              cloning.isPending
            }
            onClick={() => cloning.mutate()}
          >
            {cloning.isPending ? "Cloning… (up to a minute)" : "Clone the voice"}
          </button>
          {!data.ready.voice && (
            <p className="f-note">Needs the ElevenLabs key set on the server first.</p>
          )}
        </div>
      )}
    </div>
  );
}

function NewBlast({ data, onMade }: { data: AutoCallData; onMade: (id: string) => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveBlast);
  const [f, setF] = useState({
    title: "",
    script: "",
    language: "en" as "en" | "sw",
    source: (data.voice ? "clone" : "upload") as "clone" | "upload" | "standard",
    disclose: true,
  });
  const [file, setFile] = useState<File | null>(null);
  const making = useMutation({
    mutationFn: async () =>
      save({ data: { ...f, upload: f.source === "upload" && file ? await readFile(file) : null } }),
    onSuccess: async (r) => {
      toast.success("The auto-call is ready. Listen to it, then call yourself first.");
      await qc.invalidateQueries({ queryKey: ["autocalls"] });
      onMade(r.id);
      setF({ ...f, title: "", script: "" });
      setFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const secs = speakingSeconds(f.script);
  const SOURCES = [
    {
      key: "clone" as const,
      label: `${data.candidate}'s voice`,
      note: data.voice ? "Speaks the script" : "Clone the voice first",
      off: !data.voice,
    },
    { key: "upload" as const, label: "A recording", note: "Upload an MP3 or M4A", off: false },
    {
      key: "standard" as const,
      label: "Standard voice",
      note: "Reads the script, English only",
      off: false,
    },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>New auto-call</h2>
          <p className="meta">A short message works best: 30 to 45 seconds.</p>
        </div>
      </div>
      <div className="auth-form">
        <label className="auth-field">
          <span>Name (for you)</span>
          <input
            value={f.title}
            maxLength={120}
            placeholder="Rally invitation, Saturday"
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
        </label>
        <div className="ac-sources" role="radiogroup" aria-label="Whose voice">
          {SOURCES.map((s) => (
            <button
              type="button"
              role="radio"
              key={s.key}
              aria-checked={f.source === s.key}
              disabled={s.off}
              className={`ac-source${f.source === s.key ? " is-on" : ""}`}
              onClick={() => setF({ ...f, source: s.key })}
            >
              <b>{s.label}</b>
              <span className="meta">{s.note}</span>
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Language">
          <button
            type="button"
            aria-pressed={f.language === "en"}
            onClick={() => setF({ ...f, language: "en" })}
          >
            English
          </button>
          <button
            type="button"
            aria-pressed={f.language === "sw"}
            disabled={f.source === "standard"}
            onClick={() => setF({ ...f, language: "sw" })}
          >
            Kiswahili
          </button>
        </div>
        {f.source === "upload" ? (
          <label className="auth-field">
            <span>The recording</span>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <label className="auth-field">
            <span>What the call says{f.script.trim() ? ` · about ${secs} seconds` : ""}</span>
            <textarea
              rows={5}
              maxLength={2500}
              value={f.script}
              placeholder={
                f.language === "sw"
                  ? "Habari, ni mimi … Nakualika Jumamosi saa nane mchana, uwanja wa …"
                  : "Hello, this is … I'd like to invite you this Saturday at 2pm to …"
              }
              onChange={(e) => setF({ ...f, script: e.target.value })}
            />
          </label>
        )}
        <label className="ac-check">
          <input
            type="checkbox"
            checked={f.disclose}
            onChange={(e) => setF({ ...f, disclose: e.target.checked })}
          />{" "}
          Start by saying it&apos;s a recorded message from the campaign (recommended)
        </label>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={
            making.isPending ||
            !f.title.trim() ||
            (f.source === "upload" ? !file : f.script.trim().length < 10)
          }
          onClick={() => making.mutate()}
        >
          {making.isPending
            ? f.source === "clone"
              ? "Making the audio…"
              : "Saving…"
            : "Make the auto-call"}
        </button>
      </div>
    </div>
  );
}

function BlastPanel({
  blast,
  data,
  audience,
  describe,
}: {
  blast: Blast;
  data: AutoCallData;
  audience: BroadcastAudience;
  describe: string;
}) {
  const qc = useQueryClient();
  const test = useServerFn(testBlast);
  const count = useServerFn(countCallable);
  const send = useServerFn(sendBlast);
  const fetchCalls = useServerFn(getBlastCalls);
  const [phone, setPhone] = useState(() => rememberedPhone());
  const [testId, setTestId] = useState<string | null>(null);
  const [limit, setLimit] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ placed: number; failed: number } | null>(null);
  const { data: callable } = useQuery({
    queryKey: ["callable", blast.id, audience],
    queryFn: () => count({ data: { blastId: blast.id, audience } }),
  });
  const { data: calls } = useQuery({
    queryKey: ["blast-calls", blast.id],
    queryFn: () => fetchCalls({ data: { id: blast.id } }),
    refetchInterval: (q) =>
      running || q.state.data?.calls.some((c) => c.view.live) ? 3000 : false,
  });
  const testing = useMutation({
    mutationFn: () => {
      rememberPhone(phone);
      return test({ data: { id: blast.id, phone } });
    },
    onSuccess: (r) => {
      if (r.ok) setTestId(r.callId);
      else toast.error(r.error);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function start() {
    const n = callable?.toCall ?? 0;
    const cap = limit ? Math.min(Number(limit), n) : n;
    if (!window.confirm(`Call ${nf.format(cap)} people now with “${blast.title}”?`)) return;
    setRunning(true);
    let placed = 0;
    let failed = 0;
    let lastError: string | null = null;
    try {
      for (let round = 0; round < 500; round++) {
        const r = await send({
          data: { id: blast.id, audience, ...(limit ? { limit: Number(limit) } : {}) },
        });
        placed += r.placed;
        failed += r.failed;
        lastError = r.lastError ?? lastError;
        setProgress({ placed, failed });
        if (r.remaining <= 0 || r.placed === 0) break;
      }
      if (placed) toast.success(`${nf.format(placed)} calls placed.`);
      if (failed)
        toast.error(`${nf.format(failed)} couldn't be placed.`, {
          description: lastError ?? undefined,
        });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      await qc.invalidateQueries({ queryKey: ["autocalls"] });
      await qc.invalidateQueries({ queryKey: ["callable", blast.id] });
    }
  }

  const t = calls?.tally ?? blast.tally;
  return (
    <div className="card ac-panel" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div>
          <span className="eyebrow">
            {blast.source === "clone"
              ? `${data.candidate}'s voice`
              : blast.source === "upload"
                ? "Recording"
                : "Standard voice"}{" "}
            · {blast.language === "sw" ? "Kiswahili" : "English"}
          </span>
          <h2>{blast.title}</h2>
        </div>
      </div>
      <div className="ac-steps">
        <section>
          <h3>1. Listen</h3>
          {blast.audioUrl ? (
            <audio controls preload="none" src={blast.audioUrl} className="ac-audio" />
          ) : (
            <p className="meta">
              Read on the call by the standard voice: “{blast.script.slice(0, 160)}…”
            </p>
          )}
          <p className="f-note">
            {blast.disclose ? "Opens by saying it's a recorded message from the campaign. " : ""}
            Ends with “press 9 to stop these calls”.
          </p>
        </section>
        <section>
          <h3>2. Call yourself first</h3>
          <div className="ac-row">
            <input
              className="input"
              inputMode="tel"
              placeholder="Your phone, 0712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--sm"
              disabled={!data.canWrite || testing.isPending || !phone.trim()}
              onClick={() => testing.mutate()}
            >
              Call me
            </button>
          </div>
          {testId && <CallProgress callId={testId} />}
        </section>
        <section>
          <h3>3. Call the audience</h3>
          <p className="meta">
            {describe} ·{" "}
            {callable ? (
              <>
                <b>{nf.format(callable.consented)}</b> agreed to calls
                {callable.consented !== callable.toCall
                  ? `, ${nf.format(callable.toCall)} not yet called`
                  : ""}
              </>
            ) : (
              "counting…"
            )}
          </p>
          <div className="ac-row">
            <input
              className="input"
              type="number"
              min={1}
              placeholder="All of them, or at most…"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              aria-label="At most this many calls"
            />
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!data.canWrite || running || !callable?.toCall}
              onClick={() => void start()}
            >
              {running
                ? `Calling… ${nf.format(progress?.placed ?? 0)} placed`
                : `Start calling${callable?.toCall ? ` ${nf.format(limit ? Math.min(Number(limit), callable.toCall) : callable.toCall)}` : ""}`}
            </button>
          </div>
          <p className="f-note">
            About one call a second. Only people who agreed to calls and haven&apos;t opted out are
            rung, each once per auto-call.
          </p>
        </section>
      </div>

      {t.total > 0 && (
        <>
          <div className="ac-tally">
            {[
              ["Called", t.total],
              ["Answered", t.answered],
              ["Voicemail", t.voicemail],
              ["No answer or busy", t.missed],
              ["Failed", t.failed],
              ["Still going", t.placing],
              ["Pressed 9", t.stopped],
            ].map(([label, n]) => (
              <div key={label as string}>
                <span className="kpi-lbl">{label}</span>
                <b className="stat">{nf.format(n as number)}</b>
              </div>
            ))}
            {t.answered > 0 && (
              <div>
                <span className="kpi-lbl">Average listened</span>
                <b className="stat">{Math.round(t.listened / t.answered)} s</b>
              </div>
            )}
          </div>
          <ul className="ac-calls">
            {(calls?.calls ?? []).map((c) => (
              <li key={c.id} className={`ac-call ac-call--${c.view.tone}`}>
                <span>{c.who}</span>
                <span>{c.view.text}</span>
                <span className="mono">{stamp(c.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
