// A call followed live: Twilio's reports, read every two seconds while the call is going, shown
// as steps (an Inbox call) or one line (an auto-call or a test), then the outcome.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getCall } from "@/lib/voice.functions";

export function CallProgress({ callId }: { callId: string }) {
  const fetchCall = useServerFn(getCall);
  const { data, isError } = useQuery({
    queryKey: ["call", callId],
    queryFn: () => fetchCall({ data: { id: callId } }),
    refetchInterval: (q) => (q.state.data && !q.state.data.live ? false : 2000),
  });
  if (isError) return <p className="f-note">Couldn&apos;t read the call&apos;s progress.</p>;
  if (!data) return <p className="call-line call-line--busy">Placing the call…</p>;
  return (
    <div className="call-progress" aria-live="polite">
      {data.steps && (
        <ol className="call-steps">
          {data.steps.map((s) => (
            <li
              key={s.label}
              className={s.failed ? "call-step--failed" : s.done ? "call-step--done" : ""}
            >
              {s.label}
            </li>
          ))}
        </ol>
      )}
      <p className={`call-line call-line--${data.tone}`}>
        {data.live && <span className="call-dot" aria-hidden="true" />}
        {data.text}
      </p>
    </div>
  );
}

const PHONE_KEY = "gw-my-phone";
/** The team member's own phone, remembered on this device only. */
export const rememberedPhone = () => {
  try {
    return localStorage.getItem(PHONE_KEY) ?? "";
  } catch {
    return "";
  }
};
export const rememberPhone = (v: string) => {
  try {
    localStorage.setItem(PHONE_KEY, v);
  } catch {
    /* private window: nothing kept */
  }
};
