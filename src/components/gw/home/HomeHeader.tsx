import { LoaderCircle, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBriefingSpeech } from "@/hooks/useBriefingSpeech";

import { daysBetween, ELECTION_DAY } from "@/lib/demo/insights";
import type { Scenario } from "@/lib/demo/types";

function longDate(iso: string): string {
  return new Date(`${iso}T09:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Nairobi",
  });
}

/** Whose campaign, the day, and where the race stands, in one line. */
export function HomeHeader({
  s,
  today,
  name,
  verdict,
  script,
}: {
  s: Scenario;
  today: string;
  name: string;
  verdict: string;
  /** Home read out, from what it shows: the Listen button plays it. */
  script: string;
}) {
  const speech = useBriefingSpeech();
  const on = speech.state !== "idle";
  const minutes = Math.max(1, Math.ceil(script.split(/\s+/).length / 155));
  const days = daysBetween(today, ELECTION_DAY);
  return (
    <header className="mb-mast home-mast">
      <div className="mb-mast-main">
        <div>
          <span className="eyebrow">
            {s.candidate.name} · {s.officeLabel}, {s.seat}
          </span>
          <h1 className="mb-hello">Good morning, {name}.</h1>
          <p className="mb-mast-sub" suppressHydrationWarning>
            {longDate(today)} · <b>{days}</b> days to the election
          </p>
          {verdict ? <p className="home-verdict">{verdict}</p> : null}
        </div>
        <div className="flex max-w-72 flex-col items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            className={`mb-listen${on ? " is-on" : ""}`}
            aria-pressed={on}
            aria-label={on ? "Stop reading" : "Listen to morning briefing"}
            onClick={() => (on ? speech.stop() : void speech.play(script))}
          >
            <span className="mb-listen-icon" aria-hidden="true">
              {speech.state === "loading" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : on ? <Square /> : <Play />}
            </span>
            {speech.state === "loading" ? "Preparing · Stop" : on ? "Stop reading" : `Listen · ${minutes} min`}
          </Button>
          {speech.error && <p role="alert" className="text-sm text-destructive">{speech.error}</p>}
        </div>
      </div>
    </header>
  );
}
