import { createFileRoute, Link } from "@tanstack/react-router";

import { Cta, PageIntro, PublicPage, Qa } from "@/components/gw/landing/PublicPage";
import { faq } from "@/lib/faq";
import { pageHead } from "@/lib/seo";
import shot4 from "@/assets/landing/shot4.webp";

export const Route = createFileRoute("/sms-ussd-polls")({
  head: () =>
    pageHead({
      path: "/sms-ussd-polls",
      crumb: "Polling",
      title: "SMS and USSD polls in English and Kiswahili · Groundwork",
      description:
        "Write a question in English and Kiswahili, pick the wards and poll any phone by SMS, USSD or web link. Results are weighted to the register, with margin of error.",
    }),
  component: Polling,
});

function Polling() {
  return (
    <PublicPage>
      <PageIntro
        eyebrow="Polling"
        title={
          <>
            Polls that reach <span className="m">any phone,</span> in English and Kiswahili.
          </>
        }
        lead="Ask the estate, hear it back. Write a question in English and Kiswahili, pick the wards, and send it by SMS, USSD or a web link. Results are weighted to the register before anyone reads them."
      />

      <section>
        <div className="wrap">
          <div className="feat" style={{ paddingBlock: 0 }}>
            <div className="ft">
              <span className="eyebrow">Any phone</span>
              <h3>
                Every reply <span className="m">counts.</span>
              </h3>
              <p>
                Polls and sign-ups work by SMS reply and by USSD on any phone. A reply of "2" or
                "maji" counts, and so does a USSD menu on a kabambe.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>Thank people properly.</b> Airtime or M-Pesa, paid once per person,
                    automatically.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Honest numbers.</b> Margin of error and response rate on every result.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Weighted to the register.</b> Results are weighted to the register before
                    anyone reads them.
                  </span>
                </li>
              </ul>
            </div>
            <div className="duo">
              <div className="pic">
                <img
                  src={shot4}
                  width={1600}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                  alt="Poll builder with question, audience, channels, reward and a USSD preview"
                />
              </div>
              <div className="ussd" aria-label="Example USSD menu">
                {`*384*27#
Nini kirekebishwe kwanza mtaani kwako?
1. Taka
2. Maji
3. Barabara na taa
4. Usalama
5. Mafuriko`}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--stone-2)" }}>
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">Channels and consent</span>
              <h2>SMS and USSD carry the automated sends.</h2>
            </div>
            <p>
              Meta's WhatsApp Business Policy doesn't allow political campaigns on its automated
              Business Platform. Your team can run WhatsApp from their own phones and log
              conversations in the Groundwork inbox.
            </p>
          </div>
          <div className="trust">
            <div className="tr">
              <b>SMS and USSD</b>
              <p>Polls and sign-ups work by SMS reply and by USSD on any phone.</p>
            </div>
            <div className="tr">
              <b>Web link</b>
              <p>The web link and WhatsApp are there for people who prefer them.</p>
            </div>
            <div className="tr">
              <b>Consent, per channel</b>
              <p>
                Consent is checked per person, per channel, at the moment of sending. Broadcasts
                respect STOP.
              </p>
            </div>
            <div className="tr">
              <b>One record per person</b>
              <p>
                A poll reply, a message, a website sign-up and a door knock land on the same record
                when the number matches, and the history stays.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <Qa
            items={[faq("Does it work in Kiswahili?"), faq("Do our supporters need smartphones?")]}
          />
          <Link className="more" to="/faq">
            More questions and answers →
          </Link>
        </div>
      </section>

      <Cta />
    </PublicPage>
  );
}
