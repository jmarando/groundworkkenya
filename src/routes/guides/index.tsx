import { createFileRoute, Link } from "@tanstack/react-router";

import { Checked, GuideBody } from "@/components/gw/landing/Guide";
import { Cta, PageIntro, PublicPage } from "@/components/gw/landing/PublicPage";
import { GUIDES } from "@/lib/guides";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/guides/")({
  head: () =>
    pageHead({
      path: "/guides",
      crumb: "Guides",
      title: "Guides to Kenya's 2027 election rules, sourced · Groundwork",
      description:
        "Plain-language guides to Kenya's 2027 election: IEBC's dates, campaign spending limits and how a parallel tally works. Every fact links to the page that prints it.",
    }),
  component: Guides,
});

function Guides() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Guides"
        title={
          <>
            Kenya's 2027 election rules, <span className="m">with the source for each fact.</span>
          </>
        }
        lead="Plain-language guides to what IEBC and the law have set for the general election of 10 August 2027. Each fact is followed by a link to the page that prints it."
      />

      <GuideBody>
        <Checked />
        {GUIDES.map((g) => (
          <div key={g.path}>
            <h2>
              <Link to={g.path}>{g.crumb}</Link>
            </h2>
            <p>{g.summary}</p>
          </div>
        ))}

        <h2>How these guides are written</h2>
        <ul>
          <li>
            The facts come from IEBC's own notices and press releases, the Constitution, and Acts
            and Regulations as Kenya Law prints them. A news report is used only where no official
            document says it, and is named as a report.
          </li>
          <li>Where two sources give different dates or figures, the guide shows both.</li>
          <li>
            Each guide says when it was checked, and what has not been confirmed. They are
            information, not legal advice.
          </li>
          <li>Groundwork reports; the IEBC declares.</li>
        </ul>
      </GuideBody>

      <Cta />
    </PublicPage>
  );
}
