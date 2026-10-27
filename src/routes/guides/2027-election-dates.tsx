import { createFileRoute } from "@tanstack/react-router";

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
import {
  CONSTITUTION,
  DATES,
  DIFFERENCES,
  ELECTIONS_ACT,
  GAZETTE,
  NDERITU_REPORT,
  NOMINATION_HOURS,
  PRESS_RELEASE,
  RULING,
  RULING_REPORT,
  SEATS,
  formatDay,
} from "@/lib/election-dates";
import { GUIDES } from "@/lib/guides";
import { pageHead } from "@/lib/seo";

const GUIDE = GUIDES[0];

export const Route = createFileRoute("/guides/2027-election-dates")({
  head: () =>
    pageHead({
      path: "/guides/2027-election-dates",
      crumb: GUIDE.crumb,
      title: GUIDE.title,
      description: GUIDE.description,
    }),
  component: ElectionDates,
});

function ElectionDates() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Guide · Election dates"
        title={
          <>
            Kenya's 2027 election dates, <span className="m">as IEBC gazetted them.</span>
          </>
        }
        lead="Polling day is Tuesday 10 August 2027. Every date below is printed in IEBC's Kenya Gazette special issue of 20 August 2026 or in its press release of the same day, and each one says where."
      />

      <GuideBody>
        <Checked />

        <h2 id="polling-day">Polling day, and a court ruling</h2>
        <p>
          The Constitution says a general election is held on "the second Tuesday in August in every
          fifth year" (<Cite s={CONSTITUTION}>Article 101(1)</Cite>). IEBC's Gazette Notice 13497
          sets the presidential election for Tuesday 10 August 2027, and the other five notices in
          the same gazette give the same day for their elections (
          <Cite s={GAZETTE}>the gazette</Cite>
          ).
        </p>
        <Status title="A High Court ruling says the presidential election was due in 2026">
          <Statements items={RULING} />
          <p>
            None of the reports we read says an appeal has been filed. IEBC's own words are that the
            matter remains subject to the applicable appellate and constitutional processes.
          </p>
        </Status>

        <h2 id="key-dates">Every gazetted date, in order</h2>
        <p>
          Dates for parties, candidates, the Commission and voters. The last column links to the
          document and says where in it the date is printed.
        </p>
        <div className="gtable-wrap">
          <table className="gtable">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
                <th scope="col">Printed in</th>
              </tr>
            </thead>
            <tbody>
              {DATES.map((d) => (
                <tr key={`${d.on}|${d.who}|${d.what}`}>
                  <td className="date">
                    <time dateTime={d.on}>{formatDay(d.on)}</time>
                  </td>
                  <td>{d.who}</td>
                  <td>
                    {d.what}
                    {d.note ? <small>{d.note}</small> : null}
                  </td>
                  <td>
                    <Cite s={d.from}>{d.ref}</Cite>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="by-seat">Nominations and campaigns, seat by seat</h2>
        <p>
          Each of the six elections has its own notice. Nomination papers are delivered{" "}
          {NOMINATION_HOURS}. The campaign period ends on Saturday 7 August 2027 for every seat.
        </p>
        <div className="gtable-wrap">
          <table className="gtable">
            <thead>
              <tr>
                <th scope="col">Seat</th>
                <th scope="col">Nomination days</th>
                <th scope="col">Campaign period starts</th>
                <th scope="col">Papers go to</th>
                <th scope="col">Notice</th>
              </tr>
            </thead>
            <tbody>
              {SEATS.map((s) => (
                <tr key={s.seat}>
                  <td>{s.seat}</td>
                  <td>
                    <time dateTime={s.nominationFrom}>{formatDay(s.nominationFrom)}</time> to{" "}
                    <time dateTime={s.nominationTo}>{formatDay(s.nominationTo)}</time>
                  </td>
                  <td>
                    <time dateTime={s.campaignFrom}>{formatDay(s.campaignFrom)}</time>
                  </td>
                  <td>{s.papersTo}</td>
                  <td>
                    <Cite s={GAZETTE}>{s.notice}</Cite>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="differences">Where IEBC's two documents differ</h2>
        <p>
          The gazette is the legal notice and the press release is the Commission's summary of it.
          On two points they give different dates, so both are shown.
        </p>
        {DIFFERENCES.map((d) => (
          <div key={d.title}>
            <h3>{d.title}</h3>
            <ul>
              {d.readings.map((r) => (
                <li key={r.ref}>
                  {r.says} (<Cite s={r.from}>{r.ref}</Cite>)
                </li>
              ))}
            </ul>
            <p>{d.plain}</p>
          </div>
        ))}

        <h2 id="not-set">What these documents do not give</h2>
        <p>
          Neither document gives a date for the audit of the register of voters. IEBC's press
          release says only that the register will be audited by an independent audit firm that will
          certify it for use in the 2027 election (<Cite s={PRESS_RELEASE}>paragraph 8</Cite>).
        </p>
        <p>
          The date after which registration of voters stops is not printed in IEBC's notices. It
          follows from section 5(1)(a) of the <Cite s={ELECTIONS_ACT}>Elections Act, 2011</Cite>,
          and is counted back from polling day in the table above.
        </p>

        <MoreGuides current="/guides/2027-election-dates" />

        <Sources
          items={[
            GAZETTE,
            PRESS_RELEASE,
            CONSTITUTION,
            ELECTIONS_ACT,
            RULING_REPORT,
            NDERITU_REPORT,
          ]}
        />
      </GuideBody>

      <Cta />
    </PublicPage>
  );
}
