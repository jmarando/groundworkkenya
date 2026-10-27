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
import { DATES, GAZETTE, PRESS_RELEASE, formatDay } from "@/lib/election-dates";
import { GUIDES } from "@/lib/guides";
import { pageHead } from "@/lib/seo";
import {
  AUTHORIZED_ITEMS,
  CHALLENGE,
  NATION_PARTIES,
  NOTICE,
  PARTY_ITEMS,
  PARTY_TOTAL_KES,
  PRESIDENT_KES,
  STANDARD_SUED,
  STAR_ORDER,
  kes,
  rangeOf,
  type Limit,
} from "@/lib/spending-limits";
import { CONSTITUENCIES, COUNTIES, WARDS } from "@/lib/spending-limits-data";

const GUIDE = GUIDES[1];

export const Route = createFileRoute("/guides/2027-campaign-spending-limits")({
  head: () =>
    pageHead({
      path: "/guides/2027-campaign-spending-limits",
      crumb: GUIDE.crumb,
      title: GUIDE.title,
      description: GUIDE.description,
    }),
  component: SpendingLimits,
});

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const BY_COUNTY = COUNTIES.map((county) => ({
  county,
  constituencies: CONSTITUENCIES.filter((k) => k.county === county.code),
  wards: WARDS.filter((w) => w.county === county.code),
}));

const countyName = (code: string) => COUNTIES.find((c) => c.code === code)?.name ?? "";
const where = (r: Limit, withCounty: boolean) =>
  withCounty ? `${r.name}, ${countyName(r.county)}` : r.name;
const span = (rows: Limit[], withCounty: boolean) => {
  const { low, high } = rangeOf(rows);
  return `from KSh ${kes(low.kes)} (${where(low, withCounty)}) to KSh ${kes(high.kes)} (${where(high, withCounty)})`;
};

function Rows({ rows }: { rows: Limit[] }) {
  return (
    <div className="gtable-wrap">
      <table className="gtable tight">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" className="num">
              Limit (KSh)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td>{r.name}</td>
              <td className="num">{kes(r.kes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendingLimits() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Guide · Spending limits"
        title={
          <>
            2027 campaign spending limits, <span className="m">seat by seat.</span>
          </>
        }
        lead={`IEBC has gazetted the most a candidate may spend in the general election of 10 August 2027: KSh ${kes(PRESIDENT_KES)} for President, and a limit for every county, constituency and ward. The rules behind them are being challenged in court.`}
      />

      <GuideBody>
        <Checked />

        <Status title="The rules are in court: check before you rely on a figure">
          <Statements items={CHALLENGE} />
          <p>
            The Star describes the order as stopping Parliament from considering the regulations;
            the Nation reports it as stopping implementation of the limits themselves. We have not
            seen the order, so this guide cannot say whether the limits can be enforced today. It
            gives the figures as IEBC gazetted them.
          </p>
        </Status>

        <h2 id="at-a-glance">The limits at a glance</h2>
        <p>
          IEBC published them in <Cite s={NOTICE}>Gazette Notice No. 12251</Cite>, a special issue
          of 7 August 2026, in five schedules. Each limit is what one candidate for the seat named
          may spend during an expenditure period, in the notice's words.
        </p>
        <div className="gtable-wrap">
          <table className="gtable">
            <thead>
              <tr>
                <th scope="col">Seat</th>
                <th scope="col">Which limit</th>
                <th scope="col">Spending limit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>President</td>
                <td>One for the whole country (First Schedule)</td>
                <td>KSh {kes(PRESIDENT_KES)}</td>
              </tr>
              <tr>
                <td>County Governor, Senator and County Woman Representative</td>
                <td>One for each county (Second Schedule)</td>
                <td>{span(COUNTIES, false)}</td>
              </tr>
              <tr>
                <td>Member of the National Assembly</td>
                <td>One for each constituency (Third Schedule)</td>
                <td>{span(CONSTITUENCIES, false)}</td>
              </tr>
              <tr>
                <td>Member of a County Assembly (a ward)</td>
                <td>One for each ward (Fourth Schedule)</td>
                <td>{span(WARDS, true)}</td>
              </tr>
              <tr>
                <td>Political parties</td>
                <td>One for each party, item by item (Fifth Schedule)</td>
                <td>KSh {kes(PARTY_TOTAL_KES)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The notice's own heading says the Second Schedule's limit is for a county Governor, a
          Senator and a county Woman Member of the National Assembly. The limits for your county,
          constituency and ward are in the lists below.
        </p>

        <h2 id="what-counts">What counts as campaign spending</h2>
        <p>
          The notice says the authorized items or activities for which campaign expenses may be
          incurred, and to which the limits apply, include (<Cite s={NOTICE}>Notice 12251</Cite>):
        </p>
        <ul>
          {AUTHORIZED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2 id="contributions">Contributions</h2>
        <ul>
          <li>
            A party may receive contributions up to 100 percent of its spending limit, and a party
            candidate or independent candidate up to 100 percent of theirs (Sixth Schedule,{" "}
            <Cite s={NOTICE}>Notice 12251</Cite>).
          </li>
          <li>
            A contribution from a single source is limited to twenty percent of the total
            contributions in the schedules, under section 12(2) of the Election Campaign Financing
            Act, 2013 (<Cite s={NOTICE}>Notice 12251</Cite>).
          </li>
          <li>
            A candidate or party may not receive any contribution or donation, in cash or in kind,
            from the State, a State institution or agency or any other public resource (
            <Cite s={GAZETTE}>Notice 13503, Note 1</Cite>).
          </li>
        </ul>

        <h2 id="deadlines">What a campaign must file, and when</h2>
        <p>
          IEBC's Gazette Notice 13503 of 20 August 2026 sets the campaign financing timelines for
          parties and candidates. The full list of gazetted dates is in the{" "}
          <Link to="/guides/2027-election-dates">election dates guide</Link>.
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
              {DATES.filter((d) => d.ref.startsWith("Notice 13503")).map((d) => (
                <tr key={`${d.on}|${d.what}`}>
                  <td className="date">
                    <time dateTime={d.on}>{formatDay(d.on)}</time>
                  </td>
                  <td>{d.who}</td>
                  <td>{d.what}</td>
                  <td>
                    <Cite s={d.from}>{d.ref}</Cite>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A supporting person or organization that intends to campaign in support of, contribute to
          or otherwise directly incur expenditure in support of a candidate or political party must
          notify the Commission within seven days of receiving consent from the candidate or party (
          <Cite s={GAZETTE}>Notice 13503 (i)</Cite>).
        </p>

        <h2 id="offences">Offences and penalties, as the notices print them</h2>
        <ul>
          <li>
            A candidate who, or a political party committee which, exceeds the prescribed spending
            limits and fails to report this fact to the Commission commits an offence (section 18(7)
            of the Election Campaign Financing Act, 2013;{" "}
            <Cite s={NOTICE}>Notice 12251, Note 1</Cite>).
          </li>
          <li>
            A candidate, a political party or a media enterprise which breaches the limits
            prescribed under the Act commits an offence (
            <Cite s={GAZETTE}>Notice 13503, Note 5</Cite>
            ).
          </li>
          <li>
            A person convicted of an offence under the Act for which no penalty is provided is
            liable to a fine not exceeding two million shillings or imprisonment not exceeding five
            years, or both (sections 23 and 24; <Cite s={NOTICE}>Notice 12251, Note 2</Cite>).
          </li>
        </ul>

        <h2 id="lookup">Look up your county, constituency or ward</h2>
        <p>
          Open your county. Its first line is the limit for a Governor, a Senator and a County Woman
          Representative there; the tables are the National Assembly limit for each constituency and
          the County Assembly limit for each ward, in shillings.
        </p>
        <div className="faq">
          {BY_COUNTY.map(({ county, constituencies, wards }) => (
            <details key={county.code} id={slug(county.name)}>
              <summary>
                <span>{county.name}</span>
                <span className="mono">Governor, Senator, Woman Rep: KSh {kes(county.kes)}</span>
              </summary>
              <div className="dir-body">
                <h3>
                  National Assembly: {constituencies.length} constituenc
                  {constituencies.length === 1 ? "y" : "ies"}
                </h3>
                <Rows rows={constituencies} />
                <h3>
                  County Assembly: {wards.length} ward{wards.length === 1 ? "" : "s"}
                </h3>
                <Rows rows={wards} />
              </div>
            </details>
          ))}
        </div>

        <h2 id="parties">Political parties</h2>
        <p>
          The Fifth Schedule sets what a political party taking part in the general election may
          spend, item by item, with a total of KSh {kes(PARTY_TOTAL_KES)}.
        </p>
        <div className="gtable-wrap">
          <table className="gtable tight">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">
                  Limit (KSh)
                </th>
              </tr>
            </thead>
            <tbody>
              {PARTY_ITEMS.map((p) => (
                <tr key={p.item}>
                  <td>{p.item}</td>
                  <td className="num">{kes(p.kes)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <b>Political parties spending limit</b>
                </td>
                <td className="num">
                  <b>{kes(PARTY_TOTAL_KES)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 id="how-set">How IEBC says the limits were set</h2>
        <p>
          The Sixth Schedule says the unit cost at each level of election is worked out from the
          "ideal quota" for population and for land area, with population weighted at 70 percent and
          land area at 30 percent, plus a fixed cost for each level (
          <Cite s={NOTICE}>Notice 12251</Cite>
          ). The limits in this guide are the figures printed in the schedules.
        </p>

        <h2 id="about">About the figures on this page</h2>
        <ul>
          <li>
            They were copied from the text of the notice: 47 counties, 290 constituencies and 1,450
            wards, each once. The notice was read twice by two different scripts, which agree on
            every row.
          </li>
          <li>
            The notice lists constituencies without their counties. Each is placed in the county
            whose population its constituencies add up to; every county is within five people of its
            printed population. The same sum places each ward. The notice calls Nairobi "Nairobi
            City".
          </li>
          <li>
            This guide reports what IEBC published. It is not legal advice, and Groundwork does not
            set or enforce any limit.
          </li>
        </ul>

        <MoreGuides current="/guides/2027-campaign-spending-limits" />

        <Sources
          items={[NOTICE, GAZETTE, PRESS_RELEASE, STANDARD_SUED, STAR_ORDER, NATION_PARTIES]}
        />
      </GuideBody>

      <Cta />
    </PublicPage>
  );
}
