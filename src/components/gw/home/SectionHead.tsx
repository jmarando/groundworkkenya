import { Link } from "@tanstack/react-router";

import type { SectionMode } from "@/lib/home";

/** On anything showing invented figures. */
export function SampleTag() {
  return <span className="home-sample">Sample</span>;
}

/** A section's heading, with its Sample tag and how to make it real. */
export function SectionHead({
  id,
  title,
  mode,
  hint,
  hintTo,
}: {
  id: string;
  title: string;
  mode: SectionMode;
  hint?: string;
  hintTo?: "/people" | "/listening";
}) {
  return (
    <div className="home-head">
      <h2 id={id}>{title}</h2>
      {mode === "sample" ? (
        <span className="home-head-note">
          <SampleTag />
          {hint ? hintTo ? <Link to={hintTo}>{hint}</Link> : <span>{hint}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
