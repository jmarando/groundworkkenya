import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { feedLinks } from "@/lib/calendar";
import { getCalendarFeed } from "@/lib/diary.functions";

/**
 * "Add to your calendar": a private link Google Calendar, Apple Calendar or Outlook subscribe to.
 * The calendar app reads the diary about every hour; changes are made here, not there.
 */
export function CalendarLink() {
  const fetchFeed = useServerFn(getCalendarFeed);
  const [token, setToken] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (reset: boolean) => fetchFeed({ data: { reset } }),
    onSuccess: (r, reset) => {
      setToken(r.token);
      if (reset) toast.success("New link made. The old one has stopped working.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const links =
    token && typeof window !== "undefined" ? feedLinks(window.location.origin, token) : null;
  const copy = async () => {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.https);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy; select the link and copy it.");
    }
  };
  return (
    <div className="card cal-link">
      <div className="card-head">
        <h2>Put this calendar on your phone</h2>
        <span className="mono">Google · Apple · Outlook</span>
      </div>
      {!links ? (
        <>
          <p className="f-note">
            Your phone's calendar can show the diary and keep it up to date, about every hour. The
            link is yours alone: anyone who has it can read the diary.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={m.isPending}
            onClick={() => m.mutate(false)}
          >
            Get my calendar link
          </button>
        </>
      ) : (
        <>
          <div className="cal-actions">
            <a
              className="btn btn--primary btn--sm"
              href={links.google}
              target="_blank"
              rel="noreferrer"
            >
              Add to Google Calendar
            </a>
            <a className="btn btn--ghost btn--sm" href={links.webcal}>
              Add to Apple Calendar or Outlook
            </a>
            <button type="button" className="btn btn--ghost btn--sm" onClick={copy}>
              Copy the link
            </button>
          </div>
          <label className="sr" htmlFor="cal-url">
            Your calendar link
          </label>
          <input
            id="cal-url"
            className="cal-url"
            readOnly
            value={links.https}
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="f-note">
            Entries are changed here and show in your calendar within the hour. If the link gets
            out,{" "}
            <button
              type="button"
              className="linkish"
              disabled={m.isPending}
              onClick={() => m.mutate(true)}
            >
              make a new one
            </button>{" "}
            and the old one stops.
          </p>
        </>
      )}
    </div>
  );
}
