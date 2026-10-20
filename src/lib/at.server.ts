// Africa's Talking SMS delivery.
//
// Credentials come from AT_USERNAME and AT_API_KEY. AT_SENDER_ID is the
// alphanumeric sender name ("GROUNDWORK"); until it is approved by the
// networks we omit `from` and Africa's Talking uses its default sender.
//
// One request carries one text to many numbers. What comes back is sorted
// three ways, because they call for different handling in the outbox:
//   answered  Africa's Talking reported on each number: sent, or refused and why.
//   refused   it turned the whole request down (credentials, sender name,
//             parameters). Nothing went out.
//   unknown   no usable answer (network, server error, unreadable reply).
//             Some or all of the texts may have gone out.

import { normalizeKePhone } from "@/lib/phone";

/** The sandbox account ("sandbox") lives on a separate server with its own keys. */
export function atIsSandbox(): boolean {
  return (process.env["AT_USERNAME"] ?? "").trim().toLowerCase() === "sandbox";
}

function atApi(): string {
  return atIsSandbox()
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}

/** Status codes meaning Africa's Talking accepted the text: processed, sent, queued. */
const ACCEPTED = new Set([100, 101, 102]);

/** Plain words for the refusals a campaign team will actually meet. */
const REASONS: Record<string, string> = {
  InvalidPhoneNumber: "not a valid phone number",
  UnsupportedNumberType: "this kind of number cannot receive SMS",
  UserInBlacklist: "this number has blocked promotional texts",
  UserInBlackList: "this number has blocked promotional texts",
  DoNotDisturbRejection: "this number is on the do-not-disturb list",
  InsufficientBalance: "the Africa's Talking account is out of credit",
  InvalidSenderId: "the sender name is not approved on this network",
  CouldNotRoute: "the network could not be reached for this number",
  RiskHold: "held by Africa's Talking risk checks",
};

/** Refusals about the account rather than the number: every other text will meet them too. */
const ACCOUNT_WIDE = new Set(["InsufficientBalance", "InvalidSenderId"]);

export type AtRecipient = {
  /** The number as Africa's Talking reported it. */
  number: string;
  ok: boolean;
  id: string | null;
  costKes: number | null;
  /** Empty when ok. */
  error: string;
  /** Refused for a reason that applies to every number, such as no credit. */
  accountWide: boolean;
};

export type AtBatchResult =
  | { kind: "answered"; recipients: AtRecipient[] }
  | { kind: "refused"; error: string }
  | { kind: "unknown"; error: string };

export function atConfigured(): boolean {
  return Boolean(process.env["AT_USERNAME"] && process.env["AT_API_KEY"]);
}

/**
 * The digits of a number in international form: "0712 345678",
 * "+254712345678" and "712345678" all become "254712345678". Used both to
 * address the text and to match Africa's Talking's report back to it.
 */
export function phoneKey(phone: string | null | undefined): string {
  const ke = normalizeKePhone(phone);
  return ke ? ke.slice(1) : (phone ?? "").replace(/\D/g, "");
}

/** "KES 0.8000" → 0.8. Anything not in shillings is left unrecorded. */
export function parseCostKes(cost: string | null | undefined): number | null {
  const m = /^KES\s*([0-9]+(?:\.[0-9]+)?)$/.exec((cost ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** Sort Africa's Talking's reply into answered, refused or unknown. */
export function interpretAtReply(httpStatus: number, text: string): AtBatchResult {
  const excerpt = text.slice(0, 300);
  if (httpStatus >= 500)
    return { kind: "unknown", error: `Africa's Talking ${httpStatus}: ${excerpt}` };
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      kind: "refused",
      error: `Africa's Talking refused the request (${httpStatus}): ${excerpt}`,
    };
  }

  let json: {
    SMSMessageData?: {
      Message?: string;
      Recipients?: {
        statusCode?: number;
        number?: string;
        status?: string;
        cost?: string;
        messageId?: string;
      }[];
    };
  };
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "unknown", error: `Unreadable reply from Africa's Talking: ${excerpt}` };
  }

  const data = json?.SMSMessageData;
  if (!data || !Array.isArray(data.Recipients)) {
    return { kind: "unknown", error: `Unexpected reply from Africa's Talking: ${excerpt}` };
  }
  // An empty list is how it turns down a whole request it could parse, such
  // as an unapproved sender name: nobody was sent anything.
  if (data.Recipients.length === 0) {
    return {
      kind: "refused",
      error: `Africa's Talking sent nothing: ${data.Message ?? "no reason given"}`,
    };
  }

  return {
    kind: "answered",
    recipients: data.Recipients.map((r) => {
      const status = r.status ?? "";
      const ok =
        typeof r.statusCode === "number" ? ACCEPTED.has(r.statusCode) : status === "Success";
      const id = r.messageId && r.messageId !== "None" ? r.messageId : null;
      const reason = REASONS[status];
      return {
        number: r.number ?? "",
        ok,
        id: ok ? id : null,
        costKes: ok ? parseCostKes(r.cost) : null,
        error: ok ? "" : reason ? `${status}: ${reason}` : status || "Not sent.",
        accountWide: !ok && ACCOUNT_WIDE.has(status),
      };
    }),
  };
}

/** Send one text to up to a few hundred numbers in a single request. */
export async function sendSmsBatch(phones: string[], body: string): Promise<AtBatchResult> {
  const username = process.env["AT_USERNAME"]!;
  const apiKey = process.env["AT_API_KEY"]!;
  const senderId = process.env["AT_SENDER_ID"]?.trim();

  const to = phones.map((p) => `+${phoneKey(p)}`).join(",");
  const form = new URLSearchParams({ username, to, message: body });
  if (senderId) form.set("from", senderId);

  let res: Response;
  try {
    res = await fetch(atApi(), {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
  } catch (e) {
    return {
      kind: "unknown",
      error: `Network error reaching Africa's Talking: ${(e as Error).message}`,
    };
  }

  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    return {
      kind: "unknown",
      error: `Africa's Talking reply was cut off: ${(e as Error).message}`,
    };
  }
  return interpretAtReply(res.status, text);
}

// ------------------------------------------------------------------ airtime

function atAirtimeApi(): string {
  return atIsSandbox()
    ? "https://api.sandbox.africastalking.com/version1/airtime/send"
    : "https://api.africastalking.com/version1/airtime/send";
}

/** Africa's Talking sends airtime from 5 to 10,000 shillings a number. */
export const AIRTIME_MIN_KES = 5;
export const AIRTIME_MAX_KES = 10000;

/** Refusals of an airtime request that will meet every other request too. */
const AIRTIME_ACCOUNT_WIDE = /insufficient|balance|credit|not active|unauthori[sz]ed|invalid api/i;

/** Sort Africa's Talking's airtime reply into answered, refused or unknown. */
export function interpretAirtimeReply(httpStatus: number, text: string): AtBatchResult {
  const excerpt = text.slice(0, 300);
  if (httpStatus >= 500)
    return { kind: "unknown", error: `Africa's Talking ${httpStatus}: ${excerpt}` };
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      kind: "refused",
      error: `Africa's Talking refused the airtime (${httpStatus}): ${excerpt}`,
    };
  }
  let json: {
    errorMessage?: string;
    responses?: {
      phoneNumber?: string;
      amount?: string;
      status?: string;
      requestId?: string;
      errorMessage?: string;
    }[];
  };
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "unknown", error: `Unreadable reply from Africa's Talking: ${excerpt}` };
  }
  const responses = Array.isArray(json?.responses) ? json.responses : null;
  if (!responses) {
    return { kind: "unknown", error: `Unexpected reply from Africa's Talking: ${excerpt}` };
  }
  if (responses.length === 0) {
    return {
      kind: "refused",
      error: `Africa's Talking sent no airtime: ${json.errorMessage ?? "no reason given"}`,
    };
  }
  return {
    kind: "answered",
    recipients: responses.map((r) => {
      // "Sent" is done; "Queued" is accepted and will be sent.
      const ok = r.status === "Sent" || r.status === "Queued";
      const why =
        r.errorMessage && r.errorMessage !== "None" ? r.errorMessage : r.status || "Not sent.";
      return {
        number: r.phoneNumber ?? "",
        ok,
        id: ok && r.requestId && r.requestId !== "None" ? r.requestId : null,
        costKes: ok ? parseCostKes(r.amount) : null,
        error: ok ? "" : why,
        accountWide: !ok && AIRTIME_ACCOUNT_WIDE.test(why),
      };
    }),
  };
}

/** Send airtime to a few numbers in one request; each amount in whole shillings. */
export async function sendAirtime(
  items: { phone: string; amountKes: number }[],
): Promise<AtBatchResult> {
  const username = process.env["AT_USERNAME"]!;
  const apiKey = process.env["AT_API_KEY"]!;
  const recipients = items.map((i) => ({
    phoneNumber: `+${phoneKey(i.phone)}`,
    amount: `KES ${i.amountKes}`,
  }));
  const form = new URLSearchParams({ username, recipients: JSON.stringify(recipients) });
  let res: Response;
  try {
    res = await fetch(atAirtimeApi(), {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return {
      kind: "unknown",
      error: `Network error reaching Africa's Talking: ${(e as Error).message}`,
    };
  }
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    return {
      kind: "unknown",
      error: `Africa's Talking's reply was cut off: ${(e as Error).message}`,
    };
  }
  return interpretAirtimeReply(res.status, text);
}
