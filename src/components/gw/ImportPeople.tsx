import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { parseCSV } from "@/lib/csv";
import {
  guessMapping,
  IMPORT_FIELDS,
  prepareImport,
  type ImportField,
  type Mapping,
} from "@/lib/people";
import { beginImport, importChunk, type ChunkResult } from "@/lib/people.functions";

const nf = new Intl.NumberFormat("en-KE");
const CHUNK = 500;
const MAX_BYTES = 20 * 1024 * 1024;

const LABELS: Record<ImportField, string> = {
  name: "Name",
  phone: "Mobile number",
  ward: "Ward",
  segment: "Group",
  language: "Language",
  sms: "Agreed to SMS",
  whatsapp: "Agreed to WhatsApp",
  call: "Agreed to calls",
};

const CONSENT_FIELDS: ImportField[] = ["sms", "whatsapp", "call"];

export function ImportPeople({
  wards,
  segments,
  onClose,
}: {
  wards: { id: string; name: string }[];
  segments: { slug: string; name: string }[];
  onClose: () => void;
}) {
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [source, setSource] = useState("");
  const [consentSource, setConsentSource] = useState("");
  const [attested, setAttested] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ChunkResult | null>(null);

  const begin = useServerFn(beginImport);
  const chunk = useServerFn(importChunk);
  const queryClient = useQueryClient();

  async function readFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("That file is over 20 MB. Split it into smaller files.");
      return;
    }
    const rows = parseCSV(await file.text());
    const [head, ...rest] = rows;
    if (!head || rest.length === 0) {
      toast.error("That file has no rows under the header.");
      return;
    }
    setFilename(file.name);
    setHeaders(head);
    setRecords(rest);
    setMapping(guessMapping(head));
    setResult(null);
  }

  const prepared = useMemo(
    () =>
      mapping && mapping.phone !== null ? prepareImport(records, mapping, wards, segments) : null,
    [records, mapping, wards, segments],
  );

  const consentMapped = mapping ? CONSENT_FIELDS.some((f) => mapping[f] !== null) : false;
  const consentStated = consentMapped && consentSource.trim() !== "" && attested;

  const problem = !mapping
    ? "Choose a CSV file."
    : mapping.phone === null
      ? "Pick the column with mobile numbers."
      : !source.trim()
        ? "Say where this list came from."
        : consentMapped && consentSource.trim() !== "" && !attested
          ? "Tick the confirmation, or clear the consent source."
          : prepared && prepared.rows.length === 0
            ? "No row has a usable Kenyan mobile number."
            : null;

  async function run() {
    if (!prepared || problem) return;
    const rows = prepared.rows;
    const totals: ChunkResult = { created: 0, updated: 0, skipped: 0, consented: 0 };
    setProgress({ done: 0, total: rows.length });
    try {
      const { id } = await begin({
        data: {
          filename,
          source,
          consentSource: consentStated ? consentSource : null,
          rowsTotal: records.length,
        },
      });
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await chunk({ data: { importId: id, rows: rows.slice(i, i + CHUNK) } });
        totals.created += r.created;
        totals.updated += r.updated;
        totals.skipped += r.skipped;
        totals.consented += r.consented;
        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
      }
      setResult(totals);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The import stopped.", {
        description:
          "Rows already sent are saved. Importing the same file again only fills blanks.",
      });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="ip-title">
      <div className="pb">
        <div className="pb-head">
          <div>
            <span className="eyebrow">People · import</span>
            <h2 id="ip-title">Bring in a list.</h2>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={Boolean(progress)}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="pb-body">
          {result ? (
            <div className="ip-done">
              <p>
                <b>{nf.format(result.created)}</b> added · <b>{nf.format(result.updated)}</b>{" "}
                already on file (blanks filled) · <b>{nf.format(result.consented)}</b> with consent
                recorded.
              </p>
              <p className="f-note">
                Logged as an import of {filename} with its source, so anyone can later see where
                these records came from.
              </p>
            </div>
          ) : (
            <>
              <label className="pb-field">
                <span>CSV file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readFile(f);
                  }}
                />
              </label>

              {mapping && (
                <>
                  <p className="f-note">
                    {filename}: {nf.format(records.length)} rows. Check each column below; blank
                    means “not in this file”.
                  </p>
                  <div className="ip-map">
                    {IMPORT_FIELDS.map((f) => (
                      <label className="pb-field" key={f}>
                        <span>{LABELS[f]}</span>
                        <select
                          value={mapping[f] ?? ""}
                          onChange={(e) =>
                            setMapping({
                              ...mapping,
                              [f]: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        >
                          <option value="">—</option>
                          {headers.map((h, i) => (
                            <option key={i} value={i}>
                              {h || `Column ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>

                  <label className="pb-field">
                    <span>Where did this list come from?</span>
                    <input
                      value={source}
                      maxLength={200}
                      placeholder="e.g. Kibra rally sign-up sheets, 14 September"
                      onChange={(e) => setSource(e.target.value)}
                    />
                  </label>

                  {consentMapped && (
                    <fieldset className="pb-field ip-consent">
                      <legend>Consent in this file</legend>
                      <p className="f-note">
                        Consent columns count only if you say how these people agreed. Leave this
                        blank and everyone comes in with no consent.
                      </p>
                      <input
                        value={consentSource}
                        maxLength={300}
                        placeholder="e.g. Ticked 'send me updates' on the paper form; forms filed in the office"
                        onChange={(e) => setConsentSource(e.target.value)}
                      />
                      {consentSource.trim() !== "" && (
                        <label className="ip-attest">
                          <input
                            type="checkbox"
                            checked={attested}
                            onChange={(e) => setAttested(e.target.checked)}
                          />
                          <span>
                            I confirm the people marked in this file agreed to be contacted this
                            way, and the campaign can show how.
                          </span>
                        </label>
                      )}
                    </fieldset>
                  )}

                  {prepared && (
                    <div className="ip-preview">
                      <p>
                        <b>{nf.format(prepared.rows.length)}</b> ready to import
                        {prepared.invalid.length
                          ? ` · ${nf.format(prepared.invalid.length)} without a usable number`
                          : ""}
                        {prepared.duplicates
                          ? ` · ${nf.format(prepared.duplicates)} repeated numbers skipped`
                          : ""}
                      </p>
                      {prepared.invalid.length > 0 && (
                        <p className="f-note">
                          Lines{" "}
                          {prepared.invalid
                            .slice(0, 8)
                            .map((x) => x.line)
                            .join(", ")}
                          {prepared.invalid.length > 8 ? " and more" : ""} will be skipped.
                        </p>
                      )}
                      {prepared.unknownWards.length > 0 && (
                        <p className="f-note">
                          Wards not recognised, imported with no ward:{" "}
                          {prepared.unknownWards
                            .slice(0, 6)
                            .map((w) => `${w.name} (${w.count})`)
                            .join(", ")}
                          {prepared.unknownWards.length > 6 ? "…" : ""}
                        </p>
                      )}
                      {prepared.unknownSegments.length > 0 && (
                        <p className="f-note">
                          Groups not recognised, imported with no group:{" "}
                          {prepared.unknownSegments
                            .slice(0, 6)
                            .map((s) => `${s.name} (${s.count})`)
                            .join(", ")}
                        </p>
                      )}
                      <p className="f-note">
                        People already on file keep what they have: this only fills blanks, never
                        removes consent, and never overrides someone who replied STOP.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="pb-foot">
          {result ? (
            <>
              <p className="f-note">Done.</p>
              <button className="btn btn--primary" type="button" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <p className="f-note" aria-live="polite">
                {progress
                  ? `Importing ${nf.format(progress.done)} of ${nf.format(progress.total)}…`
                  : (problem ?? `Ready: ${nf.format(prepared?.rows.length ?? 0)} people.`)}
              </p>
              <button
                className="btn btn--primary"
                type="button"
                disabled={Boolean(problem) || Boolean(progress)}
                onClick={() => void run()}
              >
                {progress ? "Importing…" : "Import"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
