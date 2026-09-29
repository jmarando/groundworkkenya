import { useEffect, useState } from "react";

import { SampleTag } from "@/components/gw/home/SectionHead";
import { daysBetween, ELECTION_DAY } from "@/lib/demo/insights";
import { spokenBriefing } from "@/lib/demo/spoken";
import type { Scenario } from "@/lib/demo/types";
import type { SectionMode, TodayItem } from "@/lib/home";

function longDate(iso: string): string {
  return new Date(`${iso}T09:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Nairobi",
  });
}

/** Reads the briefing aloud with the browser's own voice: for the drive in. */
function useSpeech() {
  const [can, setCan] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    setCan(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window)
        window.speechSynthesis.cancel();
    };
  }, []);
  const stop = () => {
    window.speechSynthesis.cancel();
    setOn(false);
  };
  const play = (text: string) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    u.voice =
      voices.find((v) => v.lang === "en-KE") ??
      voices.find((v) => v.lang === "en-GB") ??
      voices.find((v) => v.lang.startsWith("en")) ??
      null;
    u.rate = 1;
    u.onend = () => setOn(false);
    u.onerror = () => setOn(false);
    synth.speak(u);
    setOn(true);
  };
  return { can, on, play, stop };
}

/** Whose campaign, the day, and where the race stands, in one line. */
export function HomeHeader({
  s,
  today,
  name,
  verdict,
  raceMode,
  items,
}: {
  s: Scenario;
  today: string;
  name: string;
  verdict: string;
  raceMode: SectionMode;
  /** The Today list as shown, so Listen reads out the same list. */
  items: TodayItem[];
}) {
  const speech = useSpeech();
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
          {verdict ? (
            <p className="home-verdict">
              {verdict} {raceMode === "sample" ? <SampleTag /> : null}
            </p>
          ) : null}
        </div>
        {speech.can && (
          <button
            type="button"
            className={`mb-listen${speech.on ? " is-on" : ""}`}
            aria-pressed={speech.on}
            onClick={() =>
              speech.on
                ? speech.stop()
                : speech.play(
                    spokenBriefing(s, today, {
                      name,
                      today: items,
                      ...(raceMode === "real" && verdict ? { race: verdict } : {}),
                    }),
                  )
            }
          >
            <span className="mb-listen-icon" aria-hidden="true">
              {speech.on ? "■" : "▶"}
            </span>
            {speech.on ? "Stop reading" : "Listen · 3 min"}
          </button>
        )}
      </div>
    </header>
  );
}
