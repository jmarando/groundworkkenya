import { Link } from "@tanstack/react-router";

import { SectionHead } from "@/components/gw/home/SectionHead";
import { LiveOverview } from "@/components/gw/overview/LiveOverview";
import type { SectionMode } from "@/lib/home";

/** The campaign's own machine, from its records; until there are some, what fills it. */
export function CampaignSection({ mode }: { mode: SectionMode }) {
  return (
    <section className="home-sec" id="campaign" aria-labelledby="home-campaign">
      <SectionHead id="home-campaign" title="Our campaign" />
      {mode === "real" ? (
        <LiveOverview embedded />
      ) : (
        <section className="card home-empty" aria-label="Our campaign">
          <p>No supporters on record yet.</p>
          <div className="mb-actions">
            <Link to="/people" search={{ person: undefined }} className="btn btn--primary btn--sm">
              Import people
            </Link>
          </div>
        </section>
      )}
    </section>
  );
}
