import { createFileRoute, Link } from "@tanstack/react-router";

import { Cta, PageIntro, PublicPage, Qa } from "@/components/gw/landing/PublicPage";
import { faq } from "@/lib/faq";
import { pageHead } from "@/lib/seo";
import shot7 from "@/assets/landing/shot7.webp";
import shot8 from "@/assets/landing/shot8.webp";

export const Route = createFileRoute("/election-night")({
  head: () =>
    pageHead({
      path: "/election-night",
      crumb: "Election night",
      title: "Election night: parallel tally from Form 34A by USSD · Groundwork",
      description:
        "Agents key each signed Form 34A by USSD on any phone and send a photo of the form. A parallel tally with coverage on every figure. Only the IEBC declares results.",
    }),
  component: ElectionNight,
});

function ElectionNight() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Election night"
        title={
          <>
            A parallel tally from <span className="m">Form 34A,</span> by USSD.
          </>
        }
        lead="The county, counted. Agents key the counts from each signed Form 34A by USSD on any phone and send a photo of the form. The war room shows the parallel tally against the official stream, with coverage stated on every figure."
      />

      <section>
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">The 48 hours · election day</span>
              <h2>Agents on every station, forms photographed.</h2>
            </div>
            <p>
              A parallel tally you can defend. The people you sign up in year one run your polling
              stations in August.
            </p>
          </div>
          <div className="pic">
            <img
              src={shot7}
              width={1600}
              height={1000}
              loading="lazy"
              decoding="async"
              alt="Election-night war room showing the parallel tally, projection band, station coverage and incidents"
            />
          </div>
          <div className="rules">
            <div>
              <span className="g" style={{ color: "var(--ok)" }}>
                ●
              </span>
              <b>Any phone, no app</b>
              <p>Kiswahili USSD screens walk the agent through each count and a final check.</p>
            </div>
            <div>
              <span className="g" style={{ color: "var(--amber)" }}>
                ◐
              </span>
              <b>Coverage on every number</b>
              <p>A projection always says how much of the register it has seen.</p>
            </div>
            <div>
              <span className="g" style={{ color: "var(--murram)" }}>
                ▲
              </span>
              <b>Flags, never accusations</b>
              <p>Anomalies surface with the form attached, for a human to review.</p>
            </div>
            <div>
              <span className="g" style={{ color: "var(--mist)" }}>
                ○
              </span>
              <b>Reports, doesn't declare</b>
              <p>Only the IEBC declares results. Groundwork tells you where you stand.</p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--stone-2)" }}>
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">Protect the vote</span>
              <h2>One roster, from the first door knock to the last Form 34A.</h2>
            </div>
            <p>
              Most campaigns run on spreadsheets, WhatsApp groups and a tally centre built the week
              before. Groundwork keeps one record per person and one roster of agents.
            </p>
          </div>
          <div className="trust">
            <div className="tr">
              <b>Parallel tally</b>
              <p>
                Form 34A by USSD. Agents key the counts from each signed form and send a photo of
                it.
              </p>
            </div>
            <div className="tr">
              <b>War room</b>
              <p>
                Live. The parallel tally sits beside the official stream, with coverage stated on
                every figure.
              </p>
            </div>
            <div className="tr">
              <b>Incidents</b>
              <p>Kept with a chain of custody.</p>
            </div>
            <div className="tr">
              <b>Election atlas</b>
              <p>
                2013, 2017 and 2022 results from IEBC's own forms, with what to do in each area.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="feat" style={{ paddingBlock: 0 }}>
            <div className="ft">
              <span className="eyebrow">Field app</span>
              <h3>
                Built for <span className="m">sunlight.</span>
              </h3>
              <p>
                Big targets, 2px borders, no data needed to keep working. The canvasser you train in
                November is the agent you deploy in August, on the same app.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>Offline first.</b> Door visits queue on the phone and send when there's
                    signal.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Sign-ups at the door.</b> A new supporter's name, number and consent,
                    recorded on the step.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Stipends by M-Pesa</b> once the coordinator signs off.
                  </span>
                </li>
              </ul>
            </div>
            <div className="field-preview">
              <div className="landing-phone">
                <img
                  src={shot8}
                  width={520}
                  height={1283}
                  loading="lazy"
                  decoding="async"
                  alt="Field app on a phone: agent's walk list stop with household, script and outcome buttons"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--stone-2)" }}>
        <div className="wrap">
          <Qa items={[faq("Is the parallel tally an official result?")]} />
          <Link className="more" to="/faq">
            More questions and answers →
          </Link>
        </div>
      </section>

      <Cta />
    </PublicPage>
  );
}
