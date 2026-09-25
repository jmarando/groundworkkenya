import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { DemoBadge, ScenarioSwitch } from "@/components/gw/demo/ScenarioSwitch";
import {
  Areas,
  Feed,
  Incidents,
  NightMap,
  Pipeline,
  PathToWin,
  Portal,
  Projection,
  Tally,
} from "@/components/gw/warroom/NightCards";
import { buildNight, clockOf, frameAt, NIGHT_END } from "@/lib/demo/election-night";
import type { Scenario, ScenarioKey } from "@/lib/demo/types";

/** Minutes of election night per second of playback. */
const SPEEDS = [5, 15, 30] as const;

const nf = new Intl.NumberFormat("en-KE");

/**
 * Election night, simulated: results arrive station by station from 17:00
 * to 06:00. Play it, scrub it, or switch candidate to see another office.
 */
export function ElectionNight({ s, onPick }: { s: Scenario; onPick: (key: ScenarioKey) => void }) {
  const night = useMemo(() => buildNight(s), [s]);
  // Open on a busy moment: the first time about a third of stations are in.
  const opening = useMemo(() => {
    for (let m = 0; m <= NIGHT_END; m += 10) {
      const f = frameAt(night, m);
      if (f.stations.reported >= f.stations.total * 0.33) return m;
    }
    return 0;
  }, [night]);
  const [minute, setMinute] = useState(opening);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(15);

  useEffect(() => {
    setMinute(opening);
    setPlaying(false);
  }, [opening]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setMinute((m) => {
        const next = Math.min(NIGHT_END, m + speed / 10);
        if (next >= NIGHT_END) setPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(t);
  }, [playing, speed]);

  const whole = Math.floor(minute);
  const f = useMemo(() => frameAt(night, whole), [night, whole]);

  const play = () => {
    if (minute >= NIGHT_END) setMinute(0);
    setPlaying((p) => !p);
  };

  return (
    <section
      className="view w active en"
      data-surface="warroom"
      aria-label="Election night simulation"
    >
      <div className="w-top">
        <div>
          <span className="eyebrow">Election night · Tuesday 10 August 2027 · simulation</span>
          <div className="w-title">
            {s.officeLabel} · {s.seat}
          </div>
          <p className="w-tagline">The count, as our agents see it.</p>
        </div>
        <div className="w-clockside">
          <span className="w-clock" aria-live="off">
            {f.clock} <span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>EAT</span>
          </span>
          <span className="chip">
            Stations{" "}
            <b className="stat" style={{ marginLeft: 4 }}>
              {nf.format(f.stations.reported)} / {nf.format(f.stations.total)}
            </b>
          </span>
          <Link
            to="/warroom"
            search={(prev) => ({ ...prev, mode: "live" as const })}
            className="en-mode"
          >
            Live data
          </Link>
        </div>
      </div>

      <div className="en-bar">
        <div className="en-bar-top">
          <DemoBadge fictional={s.candidate.fictional} />
          <ScenarioSwitch value={s.key} onChange={onPick} />
        </div>
        <div className="en-play">
          <button type="button" className="en-playbtn" aria-pressed={playing} onClick={play}>
            <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
            {playing ? "Pause" : minute >= NIGHT_END ? "Replay the night" : "Play the night"}
          </button>
          <label className="en-scrub">
            <span className="sr">Time on election night</span>
            <input
              type="range"
              min={0}
              max={NIGHT_END}
              step={5}
              value={whole}
              aria-valuetext={clockOf(whole)}
              onChange={(e) => {
                setPlaying(false);
                setMinute(Number(e.target.value));
              }}
            />
            <span className="en-scrub-ends" aria-hidden="true">
              <span>17:00</span>
              <span>21:00</span>
              <span>01:00</span>
              <span>06:00</span>
            </span>
          </label>
          <div className="en-speed" role="group" aria-label="Playback speed">
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                type="button"
                aria-pressed={speed === sp}
                onClick={() => setSpeed(sp)}
              >
                {sp} min/s
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-grid">
        <Tally s={s} f={f} />
        <div className="w-rail">
          <Projection s={s} f={f} />
          <PathToWin s={s} f={f} />
        </div>
        <NightMap s={s} f={f} />
        <div className="w-rail">
          <Portal f={f} />
          <Pipeline s={s} f={f} />
        </div>
        <Areas s={s} f={f} />
        <div className="w-rail">
          <Incidents f={f} />
        </div>
        <Feed s={s} f={f} />
      </div>
      <p className="mb-foot en-foot">
        A simulation for the demo: stations, votes and incidents are generated, and rivals are
        placeholders. On a real night every number here comes from photographed forms.
      </p>
    </section>
  );
}
