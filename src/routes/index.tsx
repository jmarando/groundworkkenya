import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import shot1 from "@/assets/landing/shot1.webp";
import shot2 from "@/assets/landing/shot2.webp";
import shot3 from "@/assets/landing/shot3.webp";
import shot4 from "@/assets/landing/shot4.webp";
import shot5 from "@/assets/landing/shot5.webp";
import shot6 from "@/assets/landing/shot6.webp";
import shot7 from "@/assets/landing/shot7.webp";
import shot8 from "@/assets/landing/shot8.webp";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Groundwork · the campaign OS" },
      {
        name: "description",
        content:
          "Groundwork is the campaign OS: supporters, field agents, messaging, polling, money and election night in one system, from an MCA seat to State House.",
      },
      { property: "og:title", content: "Groundwork · the campaign OS" },
      {
        property: "og:description",
        content:
          "Supporters, field agents, messaging, polling, money and election night in one system. Know every voter, reach them on the channel they answer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
  "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
  "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
  "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
];

function Mark({ stroke }: { stroke: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M86 28V14H14V86H86V52H62" fill="none" stroke={stroke} strokeWidth="13" />
      <rect x="40" y="45.5" width="13" height="13" fill="#D9481C" />
    </svg>
  );
}

function DemoForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [seat, setSeat] = useState("Governor");
  const [county, setCounty] = useState("Nairobi");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMsg({ text: "Add your name so we know who to ask for.", err: true });
      return;
    }
    if (!/^(\+?254|0)?[17]\d{8}$/.test(phone.replace(/[\s-]/g, ""))) {
      setMsg({ text: "Enter a Kenyan mobile number, like 0712 345 678.", err: true });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("demo_leads").insert({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      seat,
      county,
    });
    setBusy(false);
    if (error) {
      setMsg({
        text: "We couldn't send that just now. Email hello@groundwork.co.ke and we'll set up your demo.",
        err: true,
      });
      return;
    }
    setMsg({
      text: `Thanks, ${name.trim().split(" ")[0]}. We'll call you on ${phone.trim()} within one working day to set a time.`,
      err: false,
    });
    setName("");
    setPhone("");
    setEmail("");
    setSeat("Governor");
    setCounty("Nairobi");
  }

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      <label>
        Phone
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          placeholder="07XX XXX XXX"
          autoComplete="tel"
        />
      </label>
      <label className="full">
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
      </label>
      <label>
        Seat
        <select value={seat} onChange={(e) => setSeat(e.target.value)}>
          {["MCA", "MP", "Woman Rep", "Senator", "Governor", "Presidential", "Party"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        County
        <select value={county} onChange={(e) => setCounty(e.target.value)}>
          {COUNTIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <button className="btn full" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Book my demo"}
      </button>
      <p className="fine full">We'll only use these details to arrange your demo.</p>
      {msg && (
        <div className={`sent full${msg.err ? " err" : ""}`} role="status">
          {msg.text}
        </div>
      )}
    </form>
  );
}

function Landing() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="gw-landing">
      <header className={`nav${scrolled ? " scrolled" : ""}`}>
        <div className="wrap">
          <a className="brand" href="#top" aria-label="groundwork home">
            <Mark stroke="#141C19" />
            <b>groundwork</b>
          </a>
          <nav className="nav-links" aria-label="Sections">
            <a href="#product">Product</a>
            <a href="#election-night">Election night</a>
            <a href="#trust">Trust</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <span className="spacer" />
          <Link to="/auth" className="btn btn-o btn-s">
            Sign in
          </Link>
          <a className="btn btn-m btn-s" href="#demo">
            Book a demo
          </a>
        </div>
      </header>

      <main id="top">
        <div className="hero">
          <div className="wrap">
            <span className="eyebrow">
              <i /> The campaign OS · from an MCA seat to State House
            </span>
            <h1>
              Win it on the <span className="m">ground.</span>
            </h1>
            <p className="hero-sub">
              Know every voter by name, ward and promise made. Reach them in their language on the
              channel they actually answer — and watch every reply, door knock and shilling turn
              into votes.
            </p>
            <div className="hero-cta">
              <a className="btn btn-m" href="#demo">
                Book a demo
              </a>
              <Link to="/auth" className="btn btn-o">
                Sign in to your campaign
              </Link>
            </div>
            <div className="shot">
              <div className="frame">
                <div className="bar">
                  <i />
                  <i />
                  <i />
                  <span>app.groundwork.co.ke/voters</span>
                </div>
                <img
                  src={shot1}
                  alt="Groundwork console: satellite map of a Nairobi ward with every building coloured by canvass status and agents' walking routes"
                />
              </div>
              <div className="float f1">
                <span className="av" style={{ background: "hsl(280 65% 72%)" }}>
                  BO
                </span>
                <span>
                  <b>Brian O. · Gatundu Rd #11</b>
                  <small>Talked to Faith C. · support 4 · water</small>
                </span>
              </div>
              <div className="float f2">
                <span className="av" style={{ background: "var(--soil)", color: "#fff" }}>
                  G
                </span>
                <span>
                  <b>Street poll · 6,214 replies</b>
                  <small>Garbage 31% · Water 25% · ±1.4 pt</small>
                </span>
              </div>
              <div className="float f3">
                <span className="av" style={{ background: "hsl(142 55% 36%)", color: "#fff" }}>
                  ✓
                </span>
                <span>
                  <b>Walk list sent · 12 doors</b>
                  <small>Ordered by walking distance</small>
                </span>
              </div>
            </div>
          </div>
        </div>

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

        <section id="product">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <span className="eyebrow">One roster · three workloads</span>
                <h2>The people you sign up in year one run your polling stations in August.</h2>
              </div>
              <p>
                Most campaigns run on spreadsheets, WhatsApp groups and a tally centre built the week
                before. Groundwork keeps one record per person and one roster of agents, from the
                first door knock to the last Form 34A.
              </p>
            </div>
            <div className="three">
              <div className="wl">
                <span className="tag">The long game · 18 months</span>
                <h3>Organise</h3>
                <p>Know who lives where, who's with you, and who still needs a knock.</p>
                <ul>
                  <li>People <span>CRM</span></li>
                  <li>Know your voters <span>map</span></li>
                  <li>Canvassing &amp; walk lists <span>field</span></li>
                  <li>Agents &amp; M-Pesa stipends <span>money</span></li>
                </ul>
              </div>
              <div className="wl">
                <span className="tag">The conversation · every day</span>
                <h3>Talk and listen</h3>
                <p>
                  Every message in one inbox, every broadcast to the right doors, every trend before
                  it's a headline.
                </p>
                <ul>
                  <li>Inbox <span>SMS · DMs · email</span></li>
                  <li>Broadcast &amp; ads <span>SMS · Meta · Google</span></li>
                  <li>Listening <span>TikTok · X · YouTube</span></li>
                  <li>Polling <span>SMS · USSD · web</span></li>
                </ul>
              </div>
              <div className="wl">
                <span className="tag">The 48 hours · election day</span>
                <h3>Protect the vote</h3>
                <p>Agents on every station, forms photographed, a parallel tally you can defend.</p>
                <ul>
                  <li>Field app <span>offline</span></li>
                  <li>Parallel tally <span>Form 34A</span></li>
                  <li>War room <span>live</span></li>
                  <li>Incidents <span>chain of custody</span></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <div className="wrap">
          <div className="feat">
            <div className="ft">
              <span className="eyebrow">Know your voters</span>
              <h3>
                Every door, <span className="m">known.</span>
              </h3>
              <p>
                Satellite imagery of the ward, every rooftop outlined, every household on the record.
                Pick a street, send an agent, message the doors, and watch the reports come back.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>County to doorstep.</b> Drill from Nairobi to a ward to a single apartment
                    block.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Walk lists in one tap.</b> Draw a box over a street; the route is ordered by
                    walking distance and pushed to the agent's phone.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Five lenses.</b> Canvass status, support, agent turf, top issue, voter
                    registration.
                  </span>
                </li>
              </ul>
            </div>
            <div className="pic">
              <img
                src={shot2}
                alt="Map of a Nairobi ward with buildings coloured by support, an agent's numbered route, and the household list for one building"
              />
            </div>
          </div>

          <div className="feat rev">
            <div className="ft">
              <span className="eyebrow">People</span>
              <h3>
                One record per <span className="m">person.</span>
              </h3>
              <p>
                A poll reply, a rally check-in, a DM and a door knock all land on the same record.
                Duplicates merge; the history stays.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>Eight ways in.</b> Door knocks, rally QR codes, SMS and USSD opt-ins, DMs, web
                    sign-ups, volunteer forms, registration desks, imports.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Next best action.</b> Register them, persuade them, recruit them, or knock the
                    door.
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
                alt="People list of Kileleshwa residents with support scores and tags, and one person's record with history and next best action"
              />
            </div>
          </div>

          <div className="feat">
            <div className="ft">
              <span className="eyebrow">Polling</span>
              <h3>
                Ask the estate, <span className="m">hear it back.</span>
              </h3>
              <p>
                Write a question in English and Kiswahili, pick the wards, and send it by SMS, USSD,
                WhatsApp or a web link. Results are weighted to the register before anyone reads them.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>Any phone.</b> A reply of "2" or "maji" counts, and so does a USSD menu on a
                    kabambe.
                  </span>
                </li>
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
              </ul>
            </div>
            <div className="duo">
              <div className="pic">
                <img src={shot4} alt="Poll builder with question, audience, channels, reward and a USSD preview" />
              </div>
              <div className="ussd" aria-label="USSD menu">
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

          <div className="feat rev">
            <div className="ft">
              <span className="eyebrow">Inbox &amp; broadcast</span>
              <h3>
                Every message, <span className="m">answered.</span>
              </h3>
              <p>
                SMS, email, Facebook and Instagram DMs, X, TikTok comments and USSD call-backs in one
                queue, tagged by ward and issue and routed to the desk that owns it.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>Suggested replies</b> in the voice your campaign actually speaks.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Broadcasts that respect STOP.</b> Consent is checked per person, per channel,
                    at the moment of sending.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Team channels</b> for ward coordinators, the comms desk and finance approvals.
                  </span>
                </li>
              </ul>
            </div>
            <div className="pic">
              <img src={shot5} alt="Unified inbox with SMS, Messenger, Instagram, TikTok and USSD conversations" />
            </div>
          </div>

          <div className="feat">
            <div className="ft">
              <span className="eyebrow">Money</span>
              <h3>
                Every shilling, <span className="m">accounted.</span>
              </h3>
              <p>
                Spend against the statutory limit, e-TIMS receipts on every line, stipends to agents
                by M-Pesa, and an authorised person who approves before anything moves.
              </p>
              <ul className="ticks">
                <li>
                  <span>
                    <b>No document, no approval.</b> The block is the feature.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Append-only ledger.</b> Edits reverse; nothing is deleted.
                  </span>
                </li>
                <li>
                  <span>
                    <b>One-click audit pack</b> for disclosure.
                  </span>
                </li>
              </ul>
            </div>
            <div className="pic">
              <img
                src={shot6}
                alt="Finance view with spend against the statutory limit, contributions, documentation rate and approval queue"
              />
            </div>
          </div>
        </div>

        <section className="night" id="election-night" style={{ marginTop: 56 }}>
          <div className="wrap">
            <div className="sec-head">
              <div>
                <span className="eyebrow">Election night</span>
                <h2>
                  The county, <span className="m">counted.</span>
                </h2>
              </div>
              <p>
                Agents photograph the signed Form 34A at every station you cover. Two people enter
                each form blind. The war room shows the parallel tally against the official stream,
                with coverage stated on every figure.
              </p>
            </div>
            <div className="pic">
              <img
                src={shot7}
                alt="Election-night war room showing the parallel tally, projection band, station coverage and incidents"
              />
            </div>
            <div className="rules">
              <div>
                <span className="g" style={{ color: "var(--ok)" }}>
                  ●
                </span>
                <b>Double-blind entry</b>
                <p>Two entries per form. Disagreements go to adjudication, not to the screen.</p>
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
            <div className="feat" style={{ paddingBottom: 0 }}>
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
                      <b>Offline first.</b> Everything queues and syncs when there's signal.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>GPS-checked arrivals</b> at polling stations.
                    </span>
                  </li>
                  <li>
                    <span>
                      <b>Stipends by M-Pesa</b> once the coordinator signs off.
                    </span>
                  </li>
                </ul>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div className="duo" style={{ gridTemplateColumns: "260px" }}>
                  <div className="phone" style={{ borderColor: "#000" }}>
                    <img
                      src={shot8}
                      alt="Field app on a phone: agent's walk list stop with household, script and outcome buttons"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="trust">
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
                <p>Nothing is shared between campaigns, and we never pool your supporters with anyone else's.</p>
              </div>
              <div className="tr">
                <b>Consent on every record</b>
                <p>Channel by channel, with who captured it and when. STOP works on the spot.</p>
              </div>
              <div className="tr">
                <b>Least privilege</b>
                <p>Agents see their walk list, not the county. Phone numbers are masked unless a role needs them.</p>
              </div>
              <div className="tr">
                <b>A full audit trail</b>
                <p>Every export, message and payout is logged against the person who did it.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" style={{ background: "var(--stone-2)" }}>
          <div className="wrap">
            <div className="sec-head">
              <div>
                <span className="eyebrow">Pricing</span>
                <h2>
                  Priced by the <span className="m">ground you cover.</span>
                </h2>
              </div>
              <p>
                One workspace per campaign, sized to the seat. Messaging, airtime and M-Pesa payouts
                are billed at cost, with nothing added on top.
              </p>
            </div>
            <div className="tiers">
              <div className="tier">
                <span className="who">MCA</span>
                <h3>Ward</h3>
                <span className="n">1 ward · up to 60 agents</span>
                <ul>
                  <li>People, map &amp; walk lists</li>
                  <li>Inbox &amp; SMS broadcast</li>
                  <li>Field app &amp; tally</li>
                </ul>
                <a className="btn btn-o btn-s" href="#demo">
                  Talk to us
                </a>
              </div>
              <div className="tier">
                <span className="who">MP</span>
                <h3>Constituency</h3>
                <span className="n">Up to 8 wards · 400 agents</span>
                <ul>
                  <li>Everything in Ward</li>
                  <li>Polling &amp; listening</li>
                  <li>Finance &amp; approvals</li>
                </ul>
                <a className="btn btn-o btn-s" href="#demo">
                  Talk to us
                </a>
              </div>
              <div className="tier hl">
                <span className="who">Governor · Senator · Woman Rep</span>
                <h3>County</h3>
                <span className="n">Every ward in the county · unlimited agents</span>
                <ul>
                  <li>Everything in Constituency</li>
                  <li>War room &amp; projection</li>
                  <li>Paid media &amp; creators</li>
                </ul>
                <a className="btn btn-m btn-s" href="#demo">
                  Book a demo
                </a>
              </div>
              <div className="tier">
                <span className="who">Presidential · parties</span>
                <h3>National</h3>
                <span className="n">47 counties · coalition workspaces</span>
                <ul>
                  <li>Everything in County</li>
                  <li>Multi-county war room</li>
                  <li>Dedicated support team</li>
                </ul>
                <a className="btn btn-o btn-s" href="#demo">
                  Talk to us
                </a>
              </div>
            </div>
            <p className="note">
              Start early: the 18 months before polling day are when the roster, the map and the
              supporter list get built.
            </p>
          </div>
        </section>

        <section id="faq">
          <div className="wrap">
            <div className="sec-head" style={{ marginBottom: 24 }}>
              <div>
                <span className="eyebrow">Questions</span>
                <h2>
                  Asked on every <span className="m">first call.</span>
                </h2>
              </div>
            </div>
            <div className="faq">
              <details>
                <summary>Do our supporters need smartphones?</summary>
                <p>
                  No. Polls and sign-ups work by SMS reply and by USSD on any phone. The web link and
                  WhatsApp are there for people who prefer them. Agents use the field app on a
                  low-cost Android phone, and it keeps working without data.
                </p>
              </details>
              <details>
                <summary>Can we message supporters on WhatsApp?</summary>
                <p>
                  Your team can run WhatsApp from their own phones and log conversations in the
                  Groundwork inbox. Meta's WhatsApp Business Policy doesn't allow political campaigns
                  on its automated Business Platform, so SMS and USSD carry the automated sends. We'll
                  walk you through what works best for your seat.
                </p>
              </details>
              <details>
                <summary>Where do the supporter records come from?</summary>
                <p>
                  From your own campaign: door knocks, rallies, polls, sign-ups, events and your
                  existing lists. Every record carries its source and consent, and we don't sell or
                  supply contact lists.
                </p>
              </details>
              <details>
                <summary>Is the parallel tally an official result?</summary>
                <p>
                  No. Only the IEBC declares results. Groundwork records the forms your agents observe
                  and shows you where you stand, how much of the register you've covered, and where
                  the forms disagree.
                </p>
              </details>
              <details>
                <summary>How long does it take to get started?</summary>
                <p>
                  A workspace with your wards and your first team can be live within a week. The more
                  time before polling day, the more doors you'll have on the map.
                </p>
              </details>
              <details>
                <summary>Do you work with every party?</summary>
                <p>
                  Groundwork is a product, not a political consultancy. Each campaign gets its own
                  workspace, and nothing is shared between them.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className="demo" id="demo">
          <div className="wrap">
            <div>
              <span className="eyebrow">Book a demo</span>
              <h2>See your ward on the map.</h2>
              <p className="lead">
                Tell us the seat you're running for. We'll show you Groundwork with your own wards
                loaded, in 30 minutes.
              </p>
            </div>
            <DemoForm />
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div>
            <a className="brand" href="#top">
              <Mark stroke="#F5F5F0" />
              <b>groundwork</b>
            </a>
            <p style={{ marginTop: 14, maxWidth: "34ch" }}>
              The campaign OS. Built in Nairobi for Kenya's 2027 general election.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="#product">Organise</a>
            <a href="#product">Talk and listen</a>
            <a href="#election-night">Election night</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div>
            <h4>Company</h4>
            <a href="#trust">Trust</a>
            <a href="#faq">FAQ</a>
            <a href="#demo">Book a demo</a>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/auth">Sign in</Link>
            <a href="mailto:hello@groundwork.co.ke">hello@groundwork.co.ke</a>
          </div>
          <div className="base">
            <span>© 2026 Groundwork · groundwork.co.ke</span>
            <span>Groundwork reports; the IEBC declares.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
