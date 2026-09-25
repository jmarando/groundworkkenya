// Africa's Talking SMS delivery.
//
// Credentials come from AT_USERNAME and AT_API_KEY. AT_SENDER_ID is the
// alphanumeric sender name ("GROUNDWORK"); until it is approved by the
// networks we omit `from` and Africa's Talking uses its default sender.

const AT_API = "https://api.africastalking.com/version1/messaging";

export type AtSendResult =
  | { ok: true; id: string; cost: string | null }
  | { ok: false; error: string };

export function atConfigured(): boolean {
  return Boolean(process.env["AT_USERNAME"] && process.env["AT_API_KEY"]);
}

export async function sendSms(phone: string, body: string): Promise<AtSendResult> {
  const username = process.env["AT_USERNAME"]!;
  const apiKey = process.env["AT_API_KEY"]!;
  const senderId = process.env["AT_SENDER_ID"]?.trim();

  const form = new URLSearchParams({ username, to: phone, message: body });
  if (senderId) form.set("from", senderId);

  let res: Response;
  try {
    res = await fetch(AT_API, {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
  } catch (e) {
    return { ok: false, error: `Network error reaching Africa's Talking: ${(e as Error).message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `Africa's Talking ${res.status}: ${text.slice(0, 300)}` };
  }

  try {
    const json = JSON.parse(text) as {
      SMSMessageData?: {
        Message?: string;
        Recipients?: { status: string; messageId?: string; cost?: string }[];
      };
    };
    const r = json.SMSMessageData?.Recipients?.[0];
    if (!r) return { ok: false, error: `Unexpected reply: ${text.slice(0, 300)}` };
    if (r.status === "Success") {
      return { ok: true, id: r.messageId ?? "", cost: r.cost ?? null };
    }
    return { ok: false, error: `${r.status}: ${json.SMSMessageData?.Message ?? ""}`.trim() };
  } catch {
    return { ok: false, error: `Unreadable reply: ${text.slice(0, 300)}` };
  }
}
