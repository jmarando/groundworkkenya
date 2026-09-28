import type { WarRoomData } from "@/lib/console.functions";

const nf = new Intl.NumberFormat("en-KE");
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Forms as agents file them: counts by USSD, the signed form's photo on WhatsApp. */
export function FormsCard({
  forms,
  streams,
  form,
}: {
  forms: WarRoomData["forms"];
  streams: number;
  /** The race's result form: "37A" for a governor's campaign. */
  form: string;
}) {
  return (
    <div className="card w-span7 fx5">
      <div className="card-head">
        <h2>Form {form}</h2>
        <span className="mono">
          {nf.format(forms.streamsFiled)} of {nf.format(streams)} streams filed ·{" "}
          {nf.format(forms.photos)} with a photo
        </span>
      </div>
      {forms.recent.length === 0 ? (
        <p className="meta">
          Agents dial the campaign&apos;s USSD code, choose <b>5. Fomu {form}</b>, key in each
          stream&apos;s counts from the signed form, then send its photo on WhatsApp. Filings land
          here as they come in.
        </p>
      ) : (
        <div className="w-tblbox">
          <table className="tbl">
            <thead>
              <tr>
                <th>Filed</th>
                <th>Stream</th>
                <th style={{ textAlign: "right" }}>Votes cast</th>
                <th>Photo</th>
              </tr>
            </thead>
            <tbody>
              {forms.recent.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{hhmm(f.at)}</td>
                  <td>
                    <b className="mono">
                      {f.code}/{f.stream}
                    </b>{" "}
                    <span className="meta">{f.station}</span>
                    {f.corrected && <span className="meta"> · corrected</span>}
                    {f.overRegister && <span className="meta"> · above register</span>}
                  </td>
                  <td className="num">{nf.format(f.total)}</td>
                  <td>
                    {f.photo ? (
                      <span>
                        <span aria-hidden="true">● </span>Received
                      </span>
                    ) : (
                      <span className="meta">
                        <span aria-hidden="true">○ </span>Waiting
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {forms.photosUnplaced > 0 && (
        <p className="method">
          {nf.format(forms.photosUnplaced)} photo{forms.photosUnplaced === 1 ? "" : "s"} came
          without saying which stream; the agent was asked to send it again with a caption like
          &ldquo;{form} PS-0001/2&rdquo;.
        </p>
      )}
      <p className="method">
        Photos stay in the campaign&apos;s WhatsApp; this records when each arrived and which stream
        it belongs to.
      </p>
    </div>
  );
}
