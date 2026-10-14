import { Link } from "@tanstack/react-router";

/** In place of a page that can't open with no signal, rather than loading forever. */
export function NeedsSignal() {
  return (
    <section className="view active" aria-label="Needs signal">
      <div className="card">
        <h2>This page needs signal</h2>
        <p className="f-note">
          It opens once you're back online. The field app and the pages you've opened before work
          without signal: <Link to="/field">Field app</Link> · <Link to="/home">Home</Link>
        </p>
      </div>
    </section>
  );
}
