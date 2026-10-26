import { createFileRoute, Link } from "@tanstack/react-router";

import { Cta, PageIntro, PublicPage } from "@/components/gw/landing/PublicPage";
import { pageHead } from "@/lib/seo";
import shot2 from "@/assets/landing/shot2.webp";
import shot3 from "@/assets/landing/shot3.webp";
import shot8 from "@/assets/landing/shot8.webp";

export const Route = createFileRoute("/voters-map")({
  head: () =>
    pageHead({
      path: "/voters-map",
      crumb: "Voters map",
      title: "Voters map, walk lists and offline field app · Groundwork",
      description:
        "Satellite imagery of every ward, each household your agents meet on the map, and walk lists on the agent's phone. Built on IEBC's map of 1,450 wards.",
    }),
  component: VotersMap,
});

function VotersMap() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Know your voters"
        title={
          <>
            A voters map <span className="m">from county to doorstep.</span>
          </>
        }
        lead="Every door, known. Satellite imagery of every ward, each household your agents meet placed on the map, and the last three elections alongside. Pick a ward, send an agent, message the people there, and watch the reports come back."
      />

      <div className="scale">
        <div className="wrap">
          <p>
            Kenyan elections are won ward by ward. Groundwork is built on the country's real map,
            down to the doorstep.
          </p>
          <div>
            <b>47</b>
            <span>counties</span>
          </div>
          <div>
            <b>290</b>
            <span>constituencies</span>
          </div>
          <div>
            <b>1,450</b>
            <span>county assembly wards</span>
          </div>
          <div>
            <b>22.1M</b>
            <span>registered voters</span>
          </div>
          <span className="src">Source: IEBC, 2022 general election register.</span>
        </div>
      </div>

      <section>
        <div className="wrap">
          <div className="feat" style={{ paddingBlock: 0 }}>
            <div className="ft">
              <span className="eyebrow">On the map</span>
              <h3>
                Pick a ward, <span className="m">send an agent.</span>
              </h3>
              <p>
                Satellite imagery of every ward, each household your agents meet placed on the map,
                and the last three elections alongside.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>County to doorstep.</b> Drill from a county to a ward to the people in it,
                    and colour it by canvass, support or top issue.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Who to knock next.</b> Walk lists put the never-contacted first and go
                    straight to the agent's phone.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Past results, sourced.</b> 2013, 2017 and 2022 results from IEBC's own forms,
                    with what to do in each area.
                  </span>
                </li>
              </ul>
            </div>
            <div className="pic">
              <img
                src={shot2}
                width={1400}
                height={992}
                loading="lazy"
                decoding="async"
                alt="Map of a ward with buildings coloured by support, an agent's numbered route, and the household list for one building"
              />
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--stone-2)" }}>
        <div className="wrap">
          <div className="feat rev" style={{ paddingBlock: 0 }}>
            <div className="ft">
              <span className="eyebrow">People</span>
              <h3>
                One record per <span className="m">person.</span>
              </h3>
              <p>
                A poll reply, a message, a website sign-up and a door knock land on the same record
                when the number matches, and the history stays.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>Every way in.</b> Door knocks, SMS and USSD replies, messages, your campaign
                    website's volunteer form in English and Kiswahili, and imports.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Find them again.</b> Filter by ward, support, consent and last contact, then
                    message exactly those people.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Consent on the record.</b> Who agreed to what, on which channel, and when.
                  </span>
                </li>
              </ul>
            </div>
            <div className="pic">
              <img
                src={shot3}
                width={1300}
                height={1154}
                loading="lazy"
                decoding="async"
                alt="People list of Kileleshwa residents with support scores and tags, and one person's record with history and next best action"
              />
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
          <div className="sec-head">
            <div>
              <span className="eyebrow">Trust</span>
              <h2>
                Your data is your campaign's, and <span className="m">nobody else's.</span>
              </h2>
            </div>
            <p>
              Campaigns hold sensitive information about real people. Groundwork is built so the
              right thing is the easy thing.
            </p>
          </div>
          <div className="trust">
            <div className="tr">
              <b>One campaign per workspace</b>
              <p>
                Nothing is shared between campaigns, and we never pool your supporters with anyone
                else's.
              </p>
            </div>
            <div className="tr">
              <b>Consent on every record</b>
              <p>Channel by channel, with who captured it and when. STOP works on the spot.</p>
            </div>
            <div className="tr">
              <b>Least privilege</b>
              <p>
                Agents see their walk list, not the county. Phone numbers are masked unless a role
                needs them.
              </p>
            </div>
            <div className="tr">
              <b>A full audit trail</b>
              <p>Every export, message and payout is logged against the person who did it.</p>
            </div>
          </div>
          <Link className="more" to="/faq">
            Questions and answers →
          </Link>
        </div>
      </section>

      <Cta />
    </PublicPage>
  );
}
