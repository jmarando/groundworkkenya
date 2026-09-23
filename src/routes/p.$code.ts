// The public poll page: /p/<code>
//
// Server-rendered HTML with a plain <form> and no JavaScript. The link gets
// forwarded into WhatsApp groups and opened on KaiOS and six-year-old Androids
// over 2G; a React bundle would shut out exactly the people the poll is for.
//
// It is also the one place a stranger can write to the voter file, so:
//   - a web answer never overwrites an existing answer (anyone can type any
//     number; SMS and USSD, where the network vouches for it, can);
//   - "send me updates" asks the number to confirm by SMS instead of
//     recording consent (see requestSmsConsent);
//   - a honeypot field and a minimum fill time turn away naive bots, which
//     get a thank-you page and record nothing. Real rate limiting belongs at
//     the edge, in front of this route.

import { createFileRoute } from "@tanstack/react-router";

import { normalizeKePhone } from "@/lib/phone";
import { parseAnswer, questionText, type EnginePoll } from "@/lib/polls.engine";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

const CAMPAIGN = process.env["CAMPAIGN_NAME"] ?? "Groundwork";

/** Faster than a person can read, choose and type a number. */
const MIN_FILL_MS = 1500;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="sw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
:root{--ink:#141C19;--paper:#F5F5F0;--muted:#5B6560;--line:#DEDEDA}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px}
main{max-width:480px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:20px;padding:24px}
.eb{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
h1{font-size:22px;line-height:1.25;margin:8px 0 4px}
.sub{color:var(--muted);margin:0 0 16px}
label.o{display:flex;gap:12px;align-items:center;border:2px solid var(--ink);border-radius:12px;padding:12px 14px;margin:8px 0;font-weight:600;cursor:pointer}
label.o small{display:block;font-weight:400;color:var(--muted)}
input[type=radio]{width:20px;height:20px;accent-color:var(--ink);flex:none}
input[type=tel],textarea{width:100%;font:inherit;border:2px solid var(--ink);border-radius:12px;padding:12px 14px;margin-top:6px}
button{width:100%;min-height:52px;border:0;border-radius:12px;background:var(--ink);color:#fff;font:inherit;font-weight:700;margin-top:16px;cursor:pointer}
.err{background:#fdece7;color:#9c2f0f;border-radius:10px;padding:10px 12px;margin-bottom:12px}
.fine{font-size:12px;color:var(--muted);margin-top:12px}
.chk{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-top:12px}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.foot{text-align:center;font-size:12px;color:var(--muted);margin-top:16px}
</style>
</head>
<body><main>${body}</main>
<p class="foot">Powered by <b>groundwork</b></p>
</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notice(sw: string, en: string, status = 200): Response {
  return page(sw, `<h1>${esc(sw)}</h1><p class="sub">${esc(en)}</p>`, status);
}

const thanks = () => notice("Asante!", "Your answer is in. Thank you for taking part.");

function form(poll: EnginePoll, error?: string): Response {
  const primary = questionText(poll);
  const secondary = primary === poll.question ? poll.questionSw : poll.question;
  const sw = poll.lang === "sw";

  const choices =
    poll.kind === "open"
      ? `<textarea name="answer" rows="4" maxlength="500" required aria-label="Jibu lako · Your answer"></textarea>`
      : poll.options
          .map((o) => {
            const main = sw && o.labelSw ? o.labelSw : o.label;
            const alt = main === o.label ? o.labelSw : o.label;
            return `<label class="o"><input type="radio" name="answer" value="${esc(o.key)}" required><span>${esc(main)}${
              alt ? `<small>${esc(alt)}</small>` : ""
            }</span></label>`;
          })
          .join("");

  return page(
    `${CAMPAIGN} · Kura ya maoni`,
    `<span class="eb">${esc(CAMPAIGN)} · Sauti ya mtaa</span>
<h1>${esc(primary)}</h1>
${secondary && secondary !== primary ? `<p class="sub">${esc(secondary)}</p>` : ""}
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
<form method="post">
${choices}
<label for="phone" style="display:block;margin-top:16px;font-weight:600">Namba ya simu · Phone number</label>
<input id="phone" type="tel" name="phone" placeholder="07XX XXX XXX" required autocomplete="tel" inputmode="tel">
<label class="chk"><input type="checkbox" name="optin" value="1"> <span>Nitumie taarifa za kampeni kwa SMS · Send me campaign updates by SMS. We'll text you once to confirm.</span></label>
<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<input type="hidden" name="t" value="${Date.now()}">
<button type="submit">Tuma · Send</button>
</form>
<p class="fine">Jibu moja kwa kila namba. · One answer per phone number.</p>`,
  );
}

async function loadOpenPoll(code: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { POLL_COLUMNS, rowToEnginePoll } = await import("@/lib/inbound.server");

  if (!/^[A-Z0-9]{4,12}$/i.test(code)) return { state: "missing" as const };
  const { data } = await supabaseAdmin
    .from("polls")
    .select(`${POLL_COLUMNS}, status, channels, closes_at`)
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!data || !(data.channels ?? []).includes("web")) return { state: "missing" as const };
  const closed =
    data.status !== "live" || (data.closes_at !== null && Date.parse(data.closes_at) < Date.now());
  if (closed) return { state: "closed" as const };
  return { state: "open" as const, poll: rowToEnginePoll(data) };
}

const missing = () => notice("Kura haipatikani", "That poll link is not valid.", 404);
const closed = () => notice("Kura imefungwa", "This poll has closed. Thank you for your interest.");

export const Route = createFileRoute("/p/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const found = await loadOpenPoll(params.code);
        if (found.state === "missing") return missing();
        if (found.state === "closed") return closed();
        return form(found.poll);
      },

      POST: async ({ request, params }) => {
        const found = await loadOpenPoll(params.code);
        if (found.state === "missing") return missing();
        if (found.state === "closed") return closed();
        const poll = found.poll;

        const fields = await request.formData().catch(() => null);
        if (!fields) return form(poll, "Something went wrong. Please try again.");

        // Bots fill every field and submit instantly. Tell them it worked.
        const renderedAt = Number(fields.get("t"));
        const age = Date.now() - renderedAt;
        if (String(fields.get("website") ?? "") !== "") return thanks();
        if (!Number.isFinite(renderedAt) || age < MIN_FILL_MS) return thanks();
        // A person who left the page open overnight is not a bot: ask again,
        // don't pretend their answer was counted.
        if (age > 864e5) {
          return form(
            poll,
            "Ukurasa huu ulikaa wazi muda mrefu. Tafadhali jibu tena. · This page was open a long time — please answer again.",
          );
        }

        const phone = normalizeKePhone(String(fields.get("phone") ?? ""));
        if (!phone) {
          return form(
            poll,
            "Tumia namba ya simu kama 0712 345 678. · Use a number like 0712 345 678.",
          );
        }
        const answer = parseAnswer(poll, String(fields.get("answer") ?? "").slice(0, 500));
        if (!answer) return form(poll, "Chagua jibu. · Please choose an answer.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recordResponse, requestSmsConsent, upsertPersonByPhone } =
          await import("@/lib/inbound.server");
        const { settleIfDryRun } = await import("@/lib/outbox.server");

        const person = await upsertPersonByPhone(supabaseAdmin, phone, "web_poll");
        if (!person) return form(poll, "Something went wrong. Please try again.");

        const outcome = await recordResponse(supabaseAdmin, poll, person, "web", answer);
        if (fields.get("optin") !== null) await requestSmsConsent(supabaseAdmin, person);
        await settleIfDryRun(supabaseAdmin);

        if (outcome.alreadyAnswered) {
          return notice(
            "Namba hii imeshajibu",
            "This number has already answered. One answer counts per phone number.",
          );
        }
        if (!outcome.recorded) return form(poll, "Something went wrong. Please try again.");
        return thanks();
      },
    },
  },
});
