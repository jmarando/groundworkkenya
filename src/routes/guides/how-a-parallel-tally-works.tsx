import { createFileRoute, Link } from "@tanstack/react-router";

import {
  Checked,
  Cite,
  GuideBody,
  MoreGuides,
  Sources,
  Statements,
  Status,
} from "@/components/gw/landing/Guide";
import { Cta, PageIntro, PublicPage } from "@/components/gw/landing/PublicPage";
import { PRESS_RELEASE } from "@/lib/election-dates";
import { faq } from "@/lib/faq";
import { GUIDES } from "@/lib/guides";
import { pageHead } from "@/lib/seo";
import {
  ACT,
  AT_THE_STATION,
  BILL_REPORT,
  CARTER,
  CHANGES,
  CONSTITUTION,
  FORMS,
  HOW_RESULTS_MOVE,
  IF_THEY_DIFFER,
  PORTAL_2022,
  REGULATIONS,
  WHO_DECLARES,
} from "@/lib/tally-law";

const GUIDE = GUIDES[2];
const OFFICIAL = faq("Is the parallel tally an official result?");

export const Route = createFileRoute("/guides/how-a-parallel-tally-works")({
  head: () =>
    pageHead({
      path: "/guides/how-a-parallel-tally-works",
      crumb: GUIDE.crumb,
      title: GUIDE.title,
      description: GUIDE.description,
    }),
  component: ParallelTally,
});

function ParallelTally() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Guide · Parallel tally"
        title={
          <>
            How a parallel tally works, <span className="m">and what counts.</span>
          </>
        }
        lead="A parallel tally is a campaign adding up the polling-station result forms its own agents bring back, so it can compare its figures with IEBC's. This is what the law gives a candidate's agent to do it with, form by form, and why only IEBC's count is the result."
      />

      <GuideBody>
        <Checked />

        <Status title="Only IEBC declares results" tone="info">
          <p>
            A parallel tally is a check on the count, not a result: only the Commission declares
            results (Elections Act, section 39(1), and Article 138 of the Constitution for the
            President). This guide uses "parallel tally" to mean adding up the forms yourself; the
            law does not use the phrase in the provisions quoted below.
          </p>
        </Status>

        <h2 id="at-the-station">What the law gives a candidate's agent at the polling station</h2>
        <p>
          From the <Cite s={REGULATIONS}>Elections (General) Regulations, 2012</Cite>, as Kenya Law
          prints them consolidated to 31 December 2022 (see{" "}
          <a href="#may-change">what may change</a>):
        </p>
        <Statements items={AT_THE_STATION} />
        <p>
          So an agent in the station sees every ballot shown, can dispute one, signs the declaration
          or records why not, and leaves with a copy of it. That copy is what a parallel tally is
          built from.
        </p>

        <h2 id="forms">The result forms</h2>
        <p>
          Each race has its own set of forms in the Schedule to the Regulations. The first, signed
          at the polling station, is the one a candidate or agent receives a copy of. The others
          record how results are collated and declared above it.
        </p>
        <div className="gtable-wrap">
          <table className="gtable">
            <thead>
              <tr>
                <th scope="col">Race</th>
                <th scope="col">Polling station</th>
                <th scope="col">Constituency tallying centre</th>
                <th scope="col">County tallying centre</th>
                <th scope="col">National tallying centre</th>
              </tr>
            </thead>
            <tbody>
              {FORMS.map((f) => (
                <tr key={f.race}>
                  <td>{f.race}</td>
                  <td>Form {f.station}</td>
                  <td>
                    Form {f.constituency.form} ({f.constituency.does})
                  </td>
                  <td>{f.county ? `Form ${f.county} (declaration)` : "—"}</td>
                  <td>{f.national ? `Form ${f.national} (declaration)` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Titles and numbers are from the Schedule to the <Cite s={REGULATIONS}>Regulations</Cite>:
          for example Form 34A is "Presidential election results at the polling station" and Form
          37C is "Declaration of the county Governor election results at the county tallying
          centre". The polling-station forms are made under regulation 79. At the polling station
          the count itself is first recorded on Form 33 (regulation 76).
        </p>

        <h2 id="how-results-move">How results move up</h2>
        <Statements items={HOW_RESULTS_MOVE} />

        <h2 id="what-counts">What counts as the result</h2>
        <Statements items={WHO_DECLARES} />
        <p>
          That is why a parallel tally is a check and not a count: the Commission declares the
          result, and where the electronic and the physical results differ, the one that accurately
          records what was tallied, verified and declared at the polling station prevails (section
          39(1E)).
        </p>

        <h2 id="how-to">How a campaign runs one</h2>
        <p>Steps 1 to 3 rest on the provisions above. Steps 4 to 6 are practice, not law.</p>
        <ol>
          <li>
            Put an agent in each polling station you want to cover. The Regulations admit no more
            than one agent for each candidate or political party at a station (regulation 62(2)).
            IEBC's notices also require parties and candidates to submit the names of their Chief
            Election Agents by Tuesday 27 July 2027 (see the{" "}
            <Link to="/guides/2027-election-dates">election dates guide</Link>).
          </li>
          <li>
            The agent watches the count: each ballot is shown, and a ballot's inclusion or rejection
            can be disputed on the spot (regulation 76).
          </li>
          <li>
            When the result is announced, the agent checks the figures on the form against what was
            announced, signs it or records why not, and takes the copy the presiding officer must
            give (regulation 79).
          </li>
          <li>The agent sends the figures, and a photo of the form, to the campaign.</li>
          <li>
            The campaign adds the station figures up by ward, constituency and county, following the
            same steps as the forms, and keeps a list of the stations it has not heard from: a total
            is only as good as the share of stations behind it.
          </li>
          <li>
            The campaign compares its totals with what IEBC publishes: the polling-station forms on
            its portal for the presidential election, and the forms declared at the constituency,
            county and national tallying centres.
          </li>
        </ol>

        <h2 id="portal">What the public portal showed in 2022</h2>
        <Statements items={PORTAL_2022} />
        <p>
          The same report notes that the portal went live only days before the election (page 10).
          Section 39(1C)(c) of the <Cite s={ACT}>Elections Act</Cite> requires the Commission to
          publish the polling result forms on an online public portal for a presidential election.
        </p>

        <h2 id="if-they-differ">If your figures differ</h2>
        <p>
          Check the form first: a difference may be a figure keyed wrongly. On the day, the
          Regulations let an agent dispute a ballot (regulation 76(4)) and record why they did not
          sign (regulation 79(3)). After a declaration, the law sets short time limits for a
          petition:
        </p>
        <Statements items={IF_THEY_DIFFER} />
        <p>These limits are short, so take legal advice early. This guide is not legal advice.</p>

        <h2 id="may-change">What may change before August 2027</h2>
        <p>
          The Constitution, the Act and the Regulations above are the versions on Kenya Law,
          consolidated to 31 December 2022, which Kenya Law marked as the latest when we read them
          on 27 October 2026. IEBC has proposed changes:
        </p>
        <Statements items={CHANGES} />
        <p>
          Check <Cite s={ACT}>kenyalaw.org</Cite> for amendments made after these were read.
        </p>

        <h2 id="groundwork">Is Groundwork's parallel tally official?</h2>
        <p>{OFFICIAL.a}</p>
        <p>
          How Groundwork handles election night is on the{" "}
          <Link to="/election-night">election night page</Link>.
        </p>

        <MoreGuides current="/guides/how-a-parallel-tally-works" />

        <Sources items={[REGULATIONS, ACT, CONSTITUTION, CARTER, PRESS_RELEASE, BILL_REPORT]} />
      </GuideBody>

      <Cta />
    </PublicPage>
  );
}
