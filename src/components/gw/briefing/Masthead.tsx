import { useEffect, useState } from "react";

import { ActionButton } from "@/components/gw/briefing/parts";
import { DemoBadge, ScenarioSwitch } from "@/components/gw/demo/ScenarioSwitch";
import { daysBetween, ELECTION_DAY } from "@/lib/demo/insights";
import { spokenBriefing } from "@/lib/demo/spoken";
import type { Scenario, ScenarioKey } from "@/lib/demo/types";

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

export function Masthead({
  s,
  today,
  onPick,
}: {
  s: Scenario;
  today: string;
  onPick: (key: ScenarioKey) => void;
}) {
  const speech = useSpeech();
  const days = daysBetween(today, ELECTION_DAY);

  // A new candidate means a new briefing: stop reading the old one.
  const { stop } = speech;
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
  }, [s.key]);

  return (
    <header className="mb-mast">
      <div className="mb-mast-bar">
        <DemoBadge fictional={s.candidate.fictional} />
        <ScenarioSwitch value={s.key} onChange={onPick} />
      </div>
      <div className="mb-mast-main">
        <div>
          <h1 className="mb-hello">Good morning, {s.candidate.first}.</h1>
          <p className="mb-mast-sub" suppressHydrationWarning>
            {longDate(today)} · <b>{days}</b> days to the election · {s.officeLabel}, {s.seat}
          </p>
        </div>
        {speech.can && (
          <button
            type="button"
            className={`mb-listen${speech.on ? " is-on" : ""}`}
            aria-pressed={speech.on}
            onClick={() => (speech.on ? stop() : speech.play(spokenBriefing(s, today)))}
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

/** The three decisions that matter today, in order. */
export function TodayThree({ s }: { s: Scenario }) {
  return (
    <section className="mb-three" aria-labelledby="mb-three-h">
      <h2 id="mb-three-h" className="mb-three-h">
        Today, in order
      </h2>
      <ol>
        {s.today.map((t) => (
          <li key={t.title}>
            <h3>{t.title}</h3>
            <p>{t.detail}</p>
            <ActionButton action={t.action} />
          </li>
        ))}
      </ol>
    </section>
  );
}
